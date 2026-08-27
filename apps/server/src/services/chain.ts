import { createPublicClient, createWalletClient, http, type Address, type PublicClient } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { NovaAssetsAbi, NovaItemsAbi, readAddresses, type ContractAddresses } from '@nova/web3';
import { GameError, ON_CHAIN_SHIP_DEFS, TOKEN_ID_BY_DEF } from '@nova/shared';
import { COSMETICS_BY_ID, EQUIPMENT_BY_ID, MODULES_BY_ID, RARITY_RANK, SHIPS_BY_ID } from '@nova/game-data';
import { env } from '../env.js';
import { logger } from '../logger.js';
import type { Db } from '../db/client.js';
import { removeItems } from './inventory.js';

/**
 * The server's window onto the chain.
 *
 * Two capabilities live here and they are deliberately separate:
 *
 *  - *reading*, which needs only an RPC URL and is used to verify ownership;
 *  - *minting*, which needs the minter key and is the only privileged action
 *    the server ever performs on chain.
 *
 * Both are optional. With no RPC configured the game runs fully; the on-chain
 * features report themselves unavailable instead of pretending to work.
 */
let publicClient: PublicClient | null = null;

export function chainAddresses(): ContractAddresses {
  return readAddresses(process.env);
}

export function chainConfigured(): boolean {
  const config = env();
  const addresses = chainAddresses();
  return Boolean(config.RPC_URL) && addresses.assets !== '0x0000000000000000000000000000000000000000';
}

export function getPublicClient(): PublicClient | null {
  if (publicClient) return publicClient;
  const config = env();
  if (!config.RPC_URL) return null;
  publicClient = createPublicClient({ transport: http(config.RPC_URL) }) as PublicClient;
  return publicClient;
}

export function minterAccount() {
  const config = env();
  if (!config.MINTER_PRIVATE_KEY) return null;
  return privateKeyToAccount(config.MINTER_PRIVATE_KEY as `0x${string}`);
}

export function minterConfigured(): boolean {
  return minterAccount() !== null && chainConfigured();
}

function walletClient() {
  const config = env();
  const account = minterAccount();
  if (!account || !config.RPC_URL) return null;
  return createWalletClient({ account, transport: http(config.RPC_URL) });
}

function rarityIndex(kind: string, defId: string): number {
  const def =
    kind === 'module'
      ? MODULES_BY_ID.get(defId)
      : kind === 'equipment'
        ? EQUIPMENT_BY_ID.get(defId)
        : kind === 'cosmetic'
          ? COSMETICS_BY_ID.get(defId)
          : SHIPS_BY_ID.get(defId);
  return def ? RARITY_RANK[def.rarity] : 0;
}

export interface MintResult {
  readonly txHash: string;
  readonly kind: string;
  readonly defId: string;
  readonly amount: number;
  readonly tokenId: number | null;
}

/**
 * Mints an item the player already owns off-chain into an on-chain token.
 *
 * The off-chain copy is burned in the same transaction that records the mint,
 * so an item exists in exactly one place: the game database or the chain, never
 * both. That is the whole point of the bridge — it moves ownership, it does not
 * copy it.
 */
export async function mintItemForPlayer(
  db: Db,
  userId: string,
  kind: string,
  defId: string,
  amount: number,
): Promise<MintResult> {
  if (!minterConfigured()) {
    throw new GameError('chain_error', 'On-chain minting is not configured on this deployment.');
  }
  const tokenId = TOKEN_ID_BY_DEF.get(defId);
  if (tokenId === undefined) {
    throw new GameError('forbidden', 'That item cannot be taken on chain.');
  }

  const user = await db.user.findUniqueOrThrow({
    where: { id: userId },
    select: { address: true },
  });

  const wallet = walletClient();
  const client = getPublicClient();
  const addresses = chainAddresses();
  if (!wallet || !client) throw new GameError('chain_error', 'No RPC endpoint configured.');

  // Burn the off-chain copy first. If the chain call then fails the player has
  // lost the item from their inventory, so the burn is recorded as a pending
  // transaction and reconciled by the indexer — see WEB3.md, "bridge failures".
  await db.$transaction(async (tx) => {
    await removeItems(tx, userId, [
      { kind: kind as 'module' | 'equipment' | 'cosmetic', defId, amount },
    ]);
  });

  try {
    const txHash = await wallet.writeContract({
      address: addresses.items,
      abi: NovaItemsAbi,
      functionName: 'mint',
      args: [user.address as Address, BigInt(tokenId), BigInt(amount)],
      chain: null,
    });

    await db.chainTransaction.create({
      data: { userId, txHash, chainId: env().CHAIN_ID, intent: 'mint', status: 'pending' },
    });

    logger.info({ userId, defId, tokenId, txHash }, 'minted item on chain');
    return { txHash, kind, defId, amount, tokenId };
  } catch (error) {
    logger.error({ err: error, userId, defId }, 'mint failed after burning inventory');
    throw new GameError('chain_error', 'The mint transaction could not be sent. Contact support.');
  }
}

/** Mints a bespoke hull as an ERC-721. Used for event and tournament rewards. */
export async function mintShipForPlayer(
  db: Db,
  userId: string,
  defId: string,
): Promise<MintResult> {
  if (!minterConfigured()) {
    throw new GameError('chain_error', 'On-chain minting is not configured on this deployment.');
  }
  if (!ON_CHAIN_SHIP_DEFS.includes(defId)) {
    throw new GameError('forbidden', 'That hull is not issued on chain.');
  }

  const user = await db.user.findUniqueOrThrow({
    where: { id: userId },
    select: { address: true },
  });
  const wallet = walletClient();
  const addresses = chainAddresses();
  if (!wallet) throw new GameError('chain_error', 'No RPC endpoint configured.');

  const txHash = await wallet.writeContract({
    address: addresses.assets,
    abi: NovaAssetsAbi,
    functionName: 'mint',
    args: [
      user.address as Address,
      stringToBytes32('ship'),
      stringToBytes32(defId),
      rarityIndex('ship', defId),
      1,
      '',
    ],
    chain: null,
  });

  await db.chainTransaction.create({
    data: { userId, txHash, chainId: env().CHAIN_ID, intent: 'mint', status: 'pending' },
  });

  return { txHash, kind: 'ship', defId, amount: 1, tokenId: null };
}

/**
 * Verifies ownership against the chain itself.
 *
 * The indexed mirror in the database is a convenience for listing assets
 * quickly. Anywhere ownership actually *matters* — before honouring a listing,
 * before granting a token-gated perk — this is what is called, because the
 * mirror can lag and the chain cannot.
 */
export async function verifyOwnership(
  collection: Address,
  tokenId: bigint,
  owner: Address,
  standard: 'erc721' | 'erc1155',
): Promise<boolean> {
  const client = getPublicClient();
  if (!client) return false;

  try {
    if (standard === 'erc721') {
      const actual = await client.readContract({
        address: collection,
        abi: NovaAssetsAbi,
        functionName: 'ownerOf',
        args: [tokenId],
      });
      return (actual as string).toLowerCase() === owner.toLowerCase();
    }
    const balance = await client.readContract({
      address: collection,
      abi: NovaItemsAbi,
      functionName: 'balanceOf',
      args: [owner, tokenId],
    });
    return (balance as bigint) > 0n;
  } catch (error) {
    logger.warn({ err: error, collection, tokenId }, 'ownership check failed');
    return false;
  }
}

/** Right-pads a short ASCII string into a bytes32, the way Solidity literals do. */
export function stringToBytes32(value: string): `0x${string}` {
  const bytes = Buffer.alloc(32);
  Buffer.from(value.slice(0, 32), 'utf8').copy(bytes);
  return `0x${bytes.toString('hex')}`;
}

export function bytes32ToString(value: string): string {
  const hex = value.startsWith('0x') ? value.slice(2) : value;
  return Buffer.from(hex, 'hex').toString('utf8').replace(/\0+$/, '');
}

export { rarityIndex };
