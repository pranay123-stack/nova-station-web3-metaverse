import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import { privateKeyToAccount, type PrivateKeyAccount } from 'viem/accounts';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { prisma } from '../src/db/client.js';

// `fileURLToPath`, not `URL.pathname`: the latter is percent-encoded, so a
// checkout under a path containing a space resolves to a file that does not
// exist and dotenv fails silently, leaving DATABASE_URL undefined.
loadEnv({ path: fileURLToPath(new URL('../.env.test', import.meta.url)), override: true });

let app: FastifyInstance | null = null;

export async function testApp(): Promise<FastifyInstance> {
  if (app) return app;
  app = await buildApp();
  await app.ready();
  return app;
}

/**
 * Empties every player-owned table between tests.
 *
 * Reference tables (missions, factions, resources) are left in place because
 * they are seeded once and never mutated — truncating them would just make
 * every test file re-seed.
 */
export async function resetDatabase(): Promise<void> {
  const db = prisma();
  await db.$executeRawUnsafe(`
    TRUNCATE TABLE
      "LedgerEntry", "AreaVisit", "PlayerSession", "ChatMessage", "Friendship",
      "IndexerCursor", "ChainTransaction", "BlockchainAsset", "MarketplaceListing",
      "CraftJob", "Expedition", "PlayerAchievement", "PlayerMission",
      "PlayerFaction", "ShipModule", "ShipUpgrade", "Ship", "InventoryItem",
      "Session", "AuthNonce", "Avatar", "User"
    RESTART IDENTITY CASCADE
  `);
}

export interface TestPlayer {
  readonly account: PrivateKeyAccount;
  readonly address: string;
  readonly token: string;
  readonly userId: string;
}

/** Signs in a fresh wallet through the real SIWE flow. */
export async function signIn(index = 1): Promise<TestPlayer> {
  const server = await testApp();
  const account = privateKeyToAccount(
    `0x${index.toString(16).padStart(64, '0')}` as `0x${string}`,
  );
  const address = account.address.toLowerCase();

  const nonceResponse = await server.inject({
    method: 'POST',
    url: '/api/auth/nonce',
    payload: { address },
  });
  const { message } = nonceResponse.json<{ message: string }>();
  const signature = await account.signMessage({ message });

  const verifyResponse = await server.inject({
    method: 'POST',
    url: '/api/auth/verify',
    payload: { message, signature },
  });
  if (verifyResponse.statusCode !== 200) {
    throw new Error(`sign-in failed: ${verifyResponse.body}`);
  }
  const { token } = verifyResponse.json<{ token: string }>();

  const user = await prisma().user.findUniqueOrThrow({
    where: { address },
    select: { id: true },
  });

  return { account, address, token, userId: user.id };
}

export function authHeaders(player: TestPlayer): Record<string, string> {
  return { authorization: `Bearer ${player.token}` };
}

/** Convenience wrapper: an authenticated request returning parsed JSON. */
export async function api<T = unknown>(
  player: TestPlayer | null,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  url: string,
  payload?: unknown,
): Promise<{ status: number; body: T }> {
  const server = await testApp();
  const response = await server.inject({
    method,
    url,
    ...(player ? { headers: authHeaders(player) } : {}),
    ...(payload === undefined ? {} : { payload: payload as object }),
  });
  return { status: response.statusCode, body: response.json<T>() };
}

/** Grants resources directly, bypassing gameplay, to set up a scenario. */
export async function giveResources(
  userId: string,
  entries: readonly { defId: string; amount: number; kind?: string }[],
): Promise<void> {
  const db = prisma();
  for (const entry of entries) {
    await db.inventoryItem.upsert({
      where: {
        userId_kind_defId: { userId, kind: entry.kind ?? 'resource', defId: entry.defId },
      },
      create: { userId, kind: entry.kind ?? 'resource', defId: entry.defId, amount: entry.amount },
      update: { amount: { increment: entry.amount } },
    });
  }
}

/**
 * Grants credits through the ledger rather than straight onto the balance, so
 * the "cached balance equals the journal" invariant stays true in tests that
 * set up a scenario this way.
 */
export async function giveCredits(userId: string, amount: number): Promise<void> {
  const { moveCredits } = await import('../src/services/ledger.js');
  await prisma().$transaction(async (tx) => {
    await moveCredits(tx, {
      userId,
      kind: 'admin',
      delta: BigInt(amount),
      reason: 'test fixture',
    });
  });
}

export async function setLevel(userId: string, level: number): Promise<void> {
  const { totalXpForLevel } = await import('@nova/game-data');
  await prisma().user.update({
    where: { id: userId },
    data: { level, xp: totalXpForLevel(level) },
  });
}

export async function setReputation(
  userId: string,
  faction: string,
  reputation: number,
): Promise<void> {
  await prisma().playerFaction.upsert({
    where: { userId_factionId: { userId, factionId: faction } },
    create: { userId, factionId: faction, reputation },
    update: { reputation },
  });
}
