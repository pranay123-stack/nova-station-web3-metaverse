import {
  BASE_PLAYER_STATS,
  DEFAULT_COSMETIC_IDS,
  DEFAULT_EQUIPMENT_IDS,
  ECONOMY,
  EQUIPMENT_BY_ID,
  FACTION_IDS,
  SHIPS_BY_ID,
  STARTER_SHIP_ID,
  STARTING_CREDITS,
  levelForXp,
  totalXpForLevel,
  xpToNextLevel,
} from '@nova/game-data';
import { feeDiscountFor } from '@nova/game-engine';
import { GameError, type PlayerDto } from '@nova/shared';
import type { Db, Tx } from '../db/client.js';
import { isNewUtcDay } from '../lib/time.js';
import { moveCredits } from './ledger.js';
import { addItems, equippedItems } from './inventory.js';
import { readStanding, standingRankNames, standingRanks, unlockedAreas } from './progression.js';

/** A name every new commander gets until they change it. */
function defaultName(address: string): string {
  return `Pilot ${address.slice(2, 6).toUpperCase()}`;
}

/**
 * Finds or creates the player behind a wallet address.
 *
 * Everything a first-time player needs — a hull, a suit, the free cosmetics and
 * a starting balance — is created in one transaction, so a crash halfway
 * through cannot leave an account that exists but cannot play.
 */
export async function ensurePlayer(db: Db, address: string): Promise<string> {
  const existing = await db.user.findUnique({ where: { address }, select: { id: true } });
  if (existing) return existing.id;

  return db.$transaction(async (tx) => {
    // Re-check inside the transaction: two tabs signing in at once must not
    // both create an account for the same address.
    const raced = await tx.user.findUnique({ where: { address }, select: { id: true } });
    if (raced) return raced.id;

    const user = await tx.user.create({
      data: {
        address,
        displayName: defaultName(address),
        credits: 0n,
        energy: BASE_PLAYER_STATS.energyMax,
        health: BASE_PLAYER_STATS.healthMax,
        avatar: { create: {} },
      },
      select: { id: true },
    });

    for (const factionId of FACTION_IDS) {
      await tx.playerFaction.create({
        data: { userId: user.id, factionId, reputation: 0 },
      });
    }

    const starter = SHIPS_BY_ID.get(STARTER_SHIP_ID);
    if (!starter) throw new GameError('internal_error', 'Starter ship is missing from the catalogue.');
    await tx.ship.create({
      data: {
        userId: user.id,
        defId: starter.id,
        name: starter.name,
        active: true,
        fuel: starter.baseStats.fuel,
      },
    });

    await addItems(tx, user.id, [
      ...DEFAULT_EQUIPMENT_IDS.map((defId) => ({ kind: 'equipment' as const, defId, amount: 1 })),
      ...DEFAULT_COSMETIC_IDS.map((defId) => ({ kind: 'cosmetic' as const, defId, amount: 1 })),
    ]);

    // Equip the starting kit so a new player is not naked in the habitat.
    for (const defId of ['suit_standard', 'helmet_standard', 'badge_recruit']) {
      await tx.inventoryItem.updateMany({
        where: { userId: user.id, kind: 'equipment', defId },
        data: { equipped: true },
      });
    }

    await moveCredits(tx, {
      userId: user.id,
      kind: 'stipend',
      delta: BigInt(STARTING_CREDITS),
      reason: 'Arrival grant',
    });

    return user.id;
  });
}

/**
 * Pays the daily stipend, at most once per UTC day.
 *
 * The gate is `lastSeenAt`, which is updated in the same transaction, so
 * hammering the endpoint pays once.
 */
export async function claimDailyStipend(db: Db, userId: string): Promise<number> {
  return db.$transaction(async (tx) => {
    const user = await tx.user.findUniqueOrThrow({
      where: { id: userId },
      select: { lastSeenAt: true },
    });
    const now = new Date();
    if (!isNewUtcDay(user.lastSeenAt, now)) {
      await tx.user.update({ where: { id: userId }, data: { lastSeenAt: now } });
      return 0;
    }
    await tx.user.update({ where: { id: userId }, data: { lastSeenAt: now } });
    await moveCredits(tx, {
      userId,
      kind: 'stipend',
      delta: BigInt(ECONOMY.dailyStipend),
      reason: 'Daily station stipend',
    });
    return ECONOMY.dailyStipend;
  });
}

/** Personal stats after equipment, used for movement and energy. */
export async function personalStats(tx: Tx, userId: string) {
  const equipped = await equippedItems(tx, userId);
  let walkSpeed = BASE_PLAYER_STATS.walkSpeed;
  let energyMax = BASE_PLAYER_STATS.energyMax;
  let energyRegen = BASE_PLAYER_STATS.energyRegen;
  let scanRange = BASE_PLAYER_STATS.scanRange;
  let refineYield = 0;

  for (const defId of equipped.equipment) {
    const def = EQUIPMENT_BY_ID.get(defId);
    if (!def) continue;
    walkSpeed += def.stats.walkSpeed ?? 0;
    energyMax += def.stats.energyMax ?? 0;
    energyRegen += def.stats.energyRegen ?? 0;
    scanRange += def.stats.scanRange ?? 0;
    refineYield += def.stats.refineYield ?? 0;
  }

  return { walkSpeed, energyMax, energyRegen, scanRange, refineYield };
}

export async function playerDto(db: Db, userId: string): Promise<PlayerDto> {
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) throw new GameError('not_found', 'Player not found.');

  const standing = await readStanding(db, userId);
  const stats = await personalStats(db, userId);
  const level = levelForXp(user.xp);

  return {
    address: user.address,
    displayName: user.displayName,
    level,
    xp: user.xp,
    xpIntoLevel: user.xp - totalXpForLevel(level),
    xpForLevel: xpToNextLevel(level),
    credits: Number(user.credits),
    health: user.health,
    energy: user.energy,
    energyMax: stats.energyMax,
    playtimeSec: user.playtimeSec,
    createdAt: user.createdAt.toISOString(),
    lastSeenAt: user.lastSeenAt.toISOString(),
    primaryFaction: (user.primaryFaction as PlayerDto['primaryFaction']) ?? null,
    reputation: standing,
    ranks: standingRanks(standing),
    rankNames: standingRankNames(standing),
    feeDiscount: feeDiscountFor(standing),
    unlockedAreas: unlockedAreas(level),
    stats: {
      missionsCompleted: user.missionsCompleted,
      resourcesMined: Number(user.resourcesMined),
      creditsEarned: Number(user.creditsEarned),
      itemsCrafted: user.itemsCrafted,
      expeditions: user.expeditionsDone,
      trades: user.tradesDone,
      distanceWalked: user.distanceWalked,
    },
  };
}

export async function touchLastSeen(db: Db, userId: string): Promise<void> {
  await db.user.update({ where: { id: userId }, data: { lastSeenAt: new Date() } });
}

export async function addPlaytime(db: Db, userId: string, seconds: number): Promise<void> {
  if (seconds <= 0) return;
  await db.user.update({
    where: { id: userId },
    data: { playtimeSec: { increment: Math.min(seconds, 3600) } },
  });
}
