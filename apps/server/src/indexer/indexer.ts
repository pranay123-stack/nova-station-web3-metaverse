import { parseAbiItem, type Address, type Log } from 'viem';
import { ITEM_BY_TOKEN_ID, onChainItemName } from '@nova/shared';
import { SHIPS_BY_ID } from '@nova/game-data';
import { env } from '../env.js';
import { logger } from '../logger.js';
import type { Db } from '../db/client.js';
import { bytes32ToString, chainAddresses, chainConfigured, getPublicClient } from '../services/chain.js';

/**
 * Chain indexer.
 *
 * The database holds a *mirror* of on-chain state, never a source of truth. The
 * mirror exists so the marketplace can be browsed and an inventory rendered
 * without a dozen RPC calls per page. Two properties keep it honest:
 *
 *  - it is rebuilt purely from logs, so deleting every mirrored row and
 *    resetting the cursor reproduces the same state;
 *  - it trails the head by `INDEXER_CONFIRMATIONS` blocks, so a reorg does not
 *    leave a phantom sale in the listings table.
 *
 * Anywhere ownership decides something, `verifyOwnership` reads the chain
 * directly rather than trusting this mirror.
 */

const TRANSFER_721 = parseAbiItem(
  'event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)',
);
const TRANSFER_SINGLE = parseAbiItem(
  'event TransferSingle(address indexed operator, address indexed from, address indexed to, uint256 id, uint256 value)',
);
const TRANSFER_BATCH = parseAbiItem(
  'event TransferBatch(address indexed operator, address indexed from, address indexed to, uint256[] ids, uint256[] values)',
);
const ASSET_MINTED = parseAbiItem(
  'event AssetMinted(uint256 indexed tokenId, address indexed to, bytes32 indexed kind, bytes32 defId, uint8 rarity, uint16 generation)',
);
const LISTED = parseAbiItem(
  'event Listed(uint256 indexed listingId, address indexed seller, address indexed collection, uint256 tokenId, uint256 amount, uint256 price, uint8 standard)',
);
const SOLD = parseAbiItem(
  'event Sold(uint256 indexed listingId, address indexed buyer, address indexed seller, uint256 price, uint256 fee)',
);
const CANCELLED = parseAbiItem('event Cancelled(uint256 indexed listingId, address indexed seller)');
const PRICE_UPDATED = parseAbiItem(
  'event PriceUpdated(uint256 indexed listingId, uint256 oldPrice, uint256 newPrice)',
);

const ZERO = '0x0000000000000000000000000000000000000000';
/** Blocks fetched per poll. Keeps a single request inside RPC provider limits. */
const MAX_RANGE = 800n;

export interface IndexerHandle {
  stop(): void;
  /** Runs one poll immediately. Exposed for tests and for a manual resync. */
  tick(): Promise<void>;
}

export function startIndexer(db: Db): IndexerHandle | null {
  const config = env();
  if (!config.INDEXER_ENABLED) {
    logger.info('indexer disabled by configuration');
    return null;
  }
  if (!chainConfigured()) {
    logger.warn('indexer idle: no RPC_URL or contract addresses configured');
    return null;
  }

  let stopped = false;
  let running = false;
  let timer: NodeJS.Timeout | null = null;

  const tick = async (): Promise<void> => {
    if (running || stopped) return;
    running = true;
    try {
      await pollOnce(db);
    } catch (error) {
      logger.error({ err: error }, 'indexer poll failed');
    } finally {
      running = false;
    }
  };

  timer = setInterval(() => void tick(), config.INDEXER_POLL_MS);
  void tick();

  logger.info({ pollMs: config.INDEXER_POLL_MS }, 'indexer started');

  return {
    stop() {
      stopped = true;
      if (timer) clearInterval(timer);
    },
    tick,
  };
}

export async function pollOnce(db: Db): Promise<void> {
  const client = getPublicClient();
  if (!client) return;
  const config = env();
  const addresses = chainAddresses();
  const head = await client.getBlockNumber();
  const safeHead = head > BigInt(config.INDEXER_CONFIRMATIONS)
    ? head - BigInt(config.INDEXER_CONFIRMATIONS)
    : 0n;
  if (safeHead === 0n) return;

  for (const [name, address] of [
    ['assets', addresses.assets],
    ['items', addresses.items],
    ['marketplace', addresses.marketplace],
  ] as const) {
    if (address === ZERO) continue;
    await indexContract(db, name, address, safeHead);
  }
}

async function indexContract(
  db: Db,
  name: 'assets' | 'items' | 'marketplace',
  address: Address,
  safeHead: bigint,
): Promise<void> {
  const client = getPublicClient();
  if (!client) return;
  const config = env();
  const cursorId = `${config.CHAIN_ID}:${name}`;

  const cursor = await db.indexerCursor.upsert({
    where: { id: cursorId },
    create: {
      id: cursorId,
      chainId: config.CHAIN_ID,
      contract: name,
      lastBlock: BigInt(config.INDEXER_START_BLOCK),
    },
    update: {},
    select: { lastBlock: true },
  });

  const from = cursor.lastBlock + 1n;
  if (from > safeHead) return;
  const to = from + MAX_RANGE - 1n > safeHead ? safeHead : from + MAX_RANGE - 1n;

  const events =
    name === 'assets'
      ? [TRANSFER_721, ASSET_MINTED]
      : name === 'items'
        ? [TRANSFER_SINGLE, TRANSFER_BATCH]
        : [LISTED, SOLD, CANCELLED, PRICE_UPDATED];

  const logs = await client.getLogs({ address, events, fromBlock: from, toBlock: to });

  for (const log of logs) {
    try {
      if (name === 'assets') await handleAssetLog(db, address, log);
      else if (name === 'items') await handleItemLog(db, address, log);
      else await handleMarketLog(db, log);
    } catch (error) {
      logger.error({ err: error, contract: name, block: log.blockNumber }, 'failed to index log');
    }
  }

  await db.indexerCursor.update({ where: { id: cursorId }, data: { lastBlock: to } });
  if (logs.length > 0) {
    logger.debug({ contract: name, from: from.toString(), to: to.toString(), logs: logs.length }, 'indexed');
  }
}

/* -------------------------------------------------------------- handlers */

type AnyLog = Log & { eventName?: string; args?: Record<string, unknown> };

async function handleAssetLog(db: Db, collection: Address, log: AnyLog): Promise<void> {
  const config = env();
  if (log.eventName === 'AssetMinted') {
    const tokenId = String(log.args?.tokenId ?? '');
    const to = String(log.args?.to ?? '').toLowerCase();
    const defId = bytes32ToString(String(log.args?.defId ?? ''));
    const kind = bytes32ToString(String(log.args?.kind ?? ''));
    if (!tokenId || !to) return;

    await db.blockchainAsset.upsert({
      where: {
        chainId_collection_tokenId_owner: {
          chainId: config.CHAIN_ID,
          collection: collection.toLowerCase(),
          tokenId,
          owner: to,
        },
      },
      create: {
        chainId: config.CHAIN_ID,
        collection: collection.toLowerCase(),
        tokenId,
        standard: 'erc721',
        owner: to,
        amount: '1',
        kind,
        defId,
        lastBlock: log.blockNumber ?? 0n,
      },
      update: { amount: '1', lastBlock: log.blockNumber ?? 0n, kind, defId },
    });
    return;
  }

  if (log.eventName !== 'Transfer') return;
  const from = String(log.args?.from ?? '').toLowerCase();
  const to = String(log.args?.to ?? '').toLowerCase();
  const tokenId = String(log.args?.tokenId ?? '');
  if (!tokenId) return;

  const previous = await db.blockchainAsset.findFirst({
    where: { chainId: config.CHAIN_ID, collection: collection.toLowerCase(), tokenId },
    select: { kind: true, defId: true },
  });

  if (from !== ZERO) {
    await db.blockchainAsset.deleteMany({
      where: {
        chainId: config.CHAIN_ID,
        collection: collection.toLowerCase(),
        tokenId,
        owner: from,
      },
    });
  }
  if (to !== ZERO) {
    await db.blockchainAsset.upsert({
      where: {
        chainId_collection_tokenId_owner: {
          chainId: config.CHAIN_ID,
          collection: collection.toLowerCase(),
          tokenId,
          owner: to,
        },
      },
      create: {
        chainId: config.CHAIN_ID,
        collection: collection.toLowerCase(),
        tokenId,
        standard: 'erc721',
        owner: to,
        amount: '1',
        kind: previous?.kind ?? 'ship',
        defId: previous?.defId ?? '',
        lastBlock: log.blockNumber ?? 0n,
      },
      update: { amount: '1', lastBlock: log.blockNumber ?? 0n },
    });
    await linkShipToken(db, to, tokenId, previous?.defId ?? '');
  }
}

async function handleItemLog(db: Db, collection: Address, log: AnyLog): Promise<void> {
  const transfers: { id: string; value: bigint }[] = [];
  if (log.eventName === 'TransferSingle') {
    transfers.push({ id: String(log.args?.id ?? ''), value: BigInt(String(log.args?.value ?? '0')) });
  } else if (log.eventName === 'TransferBatch') {
    const ids = (log.args?.ids as bigint[] | undefined) ?? [];
    const values = (log.args?.values as bigint[] | undefined) ?? [];
    ids.forEach((id, index) => {
      transfers.push({ id: id.toString(), value: values[index] ?? 0n });
    });
  } else {
    return;
  }

  const from = String(log.args?.from ?? '').toLowerCase();
  const to = String(log.args?.to ?? '').toLowerCase();

  for (const transfer of transfers) {
    if (!transfer.id || transfer.value === 0n) continue;
    if (from !== ZERO) await adjustItemBalance(db, collection, transfer.id, from, -transfer.value, log);
    if (to !== ZERO) await adjustItemBalance(db, collection, transfer.id, to, transfer.value, log);
  }
}

async function adjustItemBalance(
  db: Db,
  collection: Address,
  tokenId: string,
  owner: string,
  delta: bigint,
  log: AnyLog,
): Promise<void> {
  const config = env();
  const key = {
    chainId_collection_tokenId_owner: {
      chainId: config.CHAIN_ID,
      collection: collection.toLowerCase(),
      tokenId,
      owner,
    },
  };
  const existing = await db.blockchainAsset.findUnique({ where: key, select: { amount: true } });
  const current = existing ? BigInt(existing.amount) : 0n;
  const next = current + delta;

  if (next <= 0n) {
    if (existing) await db.blockchainAsset.delete({ where: key });
    return;
  }

  const meta = ITEM_BY_TOKEN_ID.get(Number(tokenId));
  await db.blockchainAsset.upsert({
    where: key,
    create: {
      chainId: config.CHAIN_ID,
      collection: collection.toLowerCase(),
      tokenId,
      standard: 'erc1155',
      owner,
      amount: next.toString(),
      kind: meta?.kind ?? 'module',
      defId: meta?.defId ?? '',
      lastBlock: log.blockNumber ?? 0n,
    },
    update: { amount: next.toString(), lastBlock: log.blockNumber ?? 0n },
  });
}

async function handleMarketLog(db: Db, log: AnyLog): Promise<void> {
  const listingId = String(log.args?.listingId ?? '');
  if (!listingId) return;

  if (log.eventName === 'Listed') {
    const seller = String(log.args?.seller ?? '').toLowerCase();
    const collection = String(log.args?.collection ?? '').toLowerCase();
    const tokenId = String(log.args?.tokenId ?? '');
    const amount = Number(log.args?.amount ?? 1);
    const price = BigInt(String(log.args?.price ?? '0'));
    const standard = Number(log.args?.standard ?? 1) === 0 ? 'erc721' : 'erc1155';

    const user = await db.user.findUnique({ where: { address: seller }, select: { id: true } });
    if (!user) return; // A seller who has never signed in is not shown in-game.

    const meta = ITEM_BY_TOKEN_ID.get(Number(tokenId));
    const kind = standard === 'erc721' ? 'ship' : (meta?.kind ?? 'module');
    const defId = meta?.defId ?? '';

    await db.marketplaceListing.upsert({
      where: { chainListingId: listingId },
      create: {
        sellerId: user.id,
        kind,
        defId,
        amount,
        price,
        currency: 'eth',
        status: 'open',
        chainListingId: listingId,
        collection,
        tokenId,
        standard,
      },
      update: { price, status: 'open' },
    });
    return;
  }

  if (log.eventName === 'PriceUpdated') {
    await db.marketplaceListing.updateMany({
      where: { chainListingId: listingId },
      data: { price: BigInt(String(log.args?.newPrice ?? '0')) },
    });
    return;
  }

  if (log.eventName === 'Cancelled') {
    await db.marketplaceListing.updateMany({
      where: { chainListingId: listingId, status: 'open' },
      data: { status: 'cancelled' },
    });
    return;
  }

  if (log.eventName === 'Sold') {
    const buyerAddress = String(log.args?.buyer ?? '').toLowerCase();
    const buyer = await db.user.findUnique({ where: { address: buyerAddress }, select: { id: true } });
    await db.marketplaceListing.updateMany({
      where: { chainListingId: listingId, status: 'open' },
      data: { status: 'sold', soldAt: new Date(), buyerId: buyer?.id ?? null },
    });
    if (buyer) {
      await db.user.update({ where: { id: buyer.id }, data: { tradesDone: { increment: 1 } } });
    }
  }
}

/**
 * Attaches a tokenised hull to the owner's hangar.
 *
 * A player who buys an Aurora on the marketplace should find it in their hangar
 * without any further step, and the previous owner should lose it. Both follow
 * from the transfer log alone.
 */
async function linkShipToken(db: Db, owner: string, tokenId: string, defId: string): Promise<void> {
  if (!defId || !SHIPS_BY_ID.has(defId)) return;
  const user = await db.user.findUnique({ where: { address: owner }, select: { id: true } });
  if (!user) return;

  const existing = await db.ship.findFirst({ where: { tokenId }, select: { id: true, userId: true } });
  if (existing) {
    if (existing.userId === user.id) return;
    await db.ship.update({
      where: { id: existing.id },
      data: { userId: user.id, active: false },
    });
    return;
  }

  const def = SHIPS_BY_ID.get(defId);
  await db.ship.create({
    data: {
      userId: user.id,
      defId,
      name: def?.name ?? defId,
      tokenId,
      active: false,
      fuel: def?.baseStats.fuel ?? 100,
    },
  });
}

export { onChainItemName };
