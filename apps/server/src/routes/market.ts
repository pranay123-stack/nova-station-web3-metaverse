import type { FastifyInstance } from 'fastify';
import {
  GameError,
  ON_CHAIN_ITEMS,
  brokerTradeSchema,
  buyCreditListingSchema,
  cancelCreditListingSchema,
  createCreditListingSchema,
  linkTxSchema,
  listingQuerySchema,
  mintRequestSchema,
  type BlockchainAssetDto,
} from '@nova/shared';
import { RESOURCES, type ResourceId } from '@nova/game-data';
import { describeItem } from '@nova/game-engine';
import { prisma } from '../db/client.js';
import { env } from '../env.js';
import { auth, parse } from './context.js';
import {
  brokerBuy,
  brokerSell,
  browseListings,
  buyCreditListing,
  cancelCreditListing,
  createCreditListing,
  myListings,
  stationBuyPrice,
  stationSellPrice,
} from '../services/market.js';
import { playerDto } from '../services/player.js';
import {
  chainAddresses,
  chainConfigured,
  minterConfigured,
  mintItemForPlayer,
} from '../services/chain.js';

export async function marketRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/marketplace', async (request) => {
    const query = parse(listingQuerySchema, request.query);
    return { listings: await browseListings(prisma(), query) };
  });

  app.get('/api/marketplace/mine', async (request) => {
    const user = auth(request);
    return { listings: await myListings(prisma(), user.userId) };
  });

  app.post('/api/marketplace/list', async (request) => {
    const user = auth(request);
    const body = parse(createCreditListingSchema, request.body);
    const listing = await createCreditListing(prisma(), user.userId, body);
    return { listing, player: await playerDto(prisma(), user.userId) };
  });

  app.post('/api/marketplace/buy', async (request) => {
    const user = auth(request);
    const body = parse(buyCreditListingSchema, request.body);
    const result = await buyCreditListing(prisma(), user.userId, body.listingId);
    return { result, player: await playerDto(prisma(), user.userId) };
  });

  app.post('/api/marketplace/cancel', async (request) => {
    const user = auth(request);
    const body = parse(cancelCreditListingSchema, request.body);
    await cancelCreditListing(prisma(), user.userId, body.listingId);
    return { ok: true };
  });

  /* -------------------------------------------------------------- broker */

  app.get('/api/marketplace/broker', async () => ({
    prices: Object.values(RESOURCES).map((resource) => ({
      resource: resource.id,
      name: resource.name,
      buy: stationSellPrice(resource.id, 1),
      sell: stationBuyPrice(resource.id, 1),
      baseValue: resource.baseValue,
    })),
  }));

  app.post('/api/marketplace/broker/sell', async (request) => {
    const user = auth(request);
    const body = parse(brokerTradeSchema, request.body);
    const result = await brokerSell(
      prisma(),
      user.userId,
      body.resource as ResourceId,
      body.amount,
    );
    return { result, player: await playerDto(prisma(), user.userId) };
  });

  app.post('/api/marketplace/broker/buy', async (request) => {
    const user = auth(request);
    const body = parse(brokerTradeSchema, request.body);
    const result = await brokerBuy(prisma(), user.userId, body.resource as ResourceId, body.amount);
    return { result, player: await playerDto(prisma(), user.userId) };
  });

  /* ------------------------------------------------------------ on-chain */

  /**
   * Everything the client needs to talk to the chain itself.
   *
   * The client signs its own marketplace transactions with the player's wallet;
   * the server never holds a player key and never sends a transaction on their
   * behalf. This endpoint just tells the client where the contracts are.
   */
  app.get('/api/chain/config', async () => {
    const config = env();
    const addresses = chainAddresses();
    return {
      chainId: config.CHAIN_ID,
      configured: chainConfigured(),
      mintingAvailable: minterConfigured(),
      contracts: addresses,
      mintableItems: ON_CHAIN_ITEMS,
    };
  });

  app.get('/api/chain/assets', async (request) => {
    const user = auth(request);
    const db = prisma();
    const rows = await db.blockchainAsset.findMany({
      where: { owner: user.address },
      orderBy: { updatedAt: 'desc' },
    });

    const assets: BlockchainAssetDto[] = rows.map((row) => {
      const info = describeItem({
        kind: (row.kind === 'ship' ? 'module' : row.kind) as
          | 'resource'
          | 'module'
          | 'equipment'
          | 'cosmetic',
        id: row.defId,
      });
      return {
        id: row.id,
        collection: row.collection,
        standard: row.standard as 'erc721' | 'erc1155',
        tokenId: row.tokenId,
        amount: row.amount,
        kind: row.kind,
        defId: row.defId,
        name: info?.name ?? row.defId,
        rarity: info?.rarity ?? 'common',
        owner: row.owner,
        imageSeed: Number(BigInt(row.tokenId) % 1000n),
        lastSyncedBlock: row.lastBlock.toString(),
        pending: false,
      };
    });

    const pending = await db.chainTransaction.count({
      where: { userId: user.userId, status: 'pending' },
    });

    return { assets, pendingTransactions: pending };
  });

  /**
   * Moves an off-chain item onto the chain.
   *
   * The server holds the minter role, so it is the only party that can create a
   * token — but it only ever mints against an item the player already owns
   * off-chain, and burns that copy in the same operation.
   */
  app.post('/api/chain/mint', async (request) => {
    const user = auth(request);
    const body = parse(mintRequestSchema, request.body);
    if (!minterConfigured()) {
      throw new GameError(
        'chain_error',
        'This deployment has no minter key configured, so items cannot be taken on chain.',
      );
    }
    const result = await mintItemForPlayer(
      prisma(),
      user.userId,
      body.kind,
      body.defId,
      body.amount,
    );
    return { mint: result };
  });

  /**
   * Records a transaction the client sent, so its progress can be shown.
   *
   * Recording a hash proves nothing on its own — the indexer is what decides
   * whether anything actually happened. This exists so the UI can follow a
   * transaction, not so the client can assert an outcome.
   */
  app.post('/api/chain/transactions', async (request) => {
    const user = auth(request);
    const body = parse(linkTxSchema, request.body);
    const db = prisma();
    await db.chainTransaction.upsert({
      where: { txHash: body.txHash },
      create: {
        userId: user.userId,
        txHash: body.txHash,
        chainId: env().CHAIN_ID,
        intent: body.intent,
        status: 'pending',
      },
      update: {},
    });
    return { ok: true };
  });

  app.get('/api/chain/transactions', async (request) => {
    const user = auth(request);
    const rows = await prisma().chainTransaction.findMany({
      where: { userId: user.userId },
      orderBy: { createdAt: 'desc' },
      take: 25,
    });
    return {
      transactions: rows.map((row) => ({
        txHash: row.txHash,
        intent: row.intent,
        status: row.status,
        blockNumber: row.blockNumber?.toString() ?? null,
        createdAt: row.createdAt.toISOString(),
        confirmedAt: row.confirmedAt?.toISOString() ?? null,
      })),
    };
  });
}
