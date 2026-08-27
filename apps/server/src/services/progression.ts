import {
  ACHIEVEMENTS,
  AREA_UNLOCK_LEVEL,
  FACTIONS,
  FACTION_IDS,
  levelUpCreditReward,
  type AchievementMetric,
  type FactionId,
  type StationAreaId,
} from '@nova/game-data';
import { applyReputation, applyXp, rankFor, type FactionStanding } from '@nova/game-engine';
import type { Tx } from '../db/client.js';
import { moveCredits } from './ledger.js';

export interface ProgressionResult {
  readonly xp: number;
  readonly level: number;
  readonly levelsGained: number;
  readonly creditBonus: number;
  readonly unlockedAchievements: readonly string[];
}

/**
 * Awards XP and settles everything that follows from it: the new level, the
 * level-up credit bonus (through the ledger, like every other credit movement)
 * and any achievement the new level unlocks.
 */
export async function awardXp(tx: Tx, userId: string, amount: number): Promise<ProgressionResult> {
  const user = await tx.user.findUniqueOrThrow({
    where: { id: userId },
    select: { xp: true, level: true },
  });

  const result = applyXp(user.xp, amount);
  await tx.user.update({
    where: { id: userId },
    data: { xp: result.xp, level: result.level },
  });

  if (result.creditBonus > 0) {
    await moveCredits(tx, {
      userId,
      kind: 'levelup',
      delta: BigInt(result.creditBonus),
      reason: `Reached level ${result.level}`,
    });
  }

  const unlocked = await checkAchievements(tx, userId);

  return {
    xp: result.xp,
    level: result.level,
    levelsGained: result.levelsGained,
    creditBonus: result.creditBonus,
    unlockedAchievements: unlocked,
  };
}

export interface ReputationResult {
  readonly standing: FactionStanding;
  readonly deltas: FactionStanding;
  readonly ranksGained: Partial<Record<FactionId, number>>;
}

/** Awards reputation with one faction and propagates the cross-faction effect. */
export async function awardReputation(
  tx: Tx,
  userId: string,
  faction: FactionId,
  amount: number,
): Promise<ReputationResult> {
  const rows = await tx.playerFaction.findMany({ where: { userId } });
  const standing: FactionStanding = { federation: 0, helix: 0, void: 0 };
  for (const row of rows) {
    if (isFactionId(row.factionId)) standing[row.factionId] = row.reputation;
  }

  const change = applyReputation(standing, faction, amount);

  for (const id of FACTION_IDS) {
    if (change.deltas[id] === 0) continue;
    await tx.playerFaction.upsert({
      where: { userId_factionId: { userId, factionId: id } },
      create: { userId, factionId: id, reputation: change.standing[id] },
      update: { reputation: change.standing[id] },
    });
  }

  // The faction a player stands highest with becomes their public allegiance.
  const best = FACTION_IDS.reduce((top, id) =>
    change.standing[id] > change.standing[top] ? id : top,
  );
  if (change.standing[best] > 0) {
    await tx.user.update({ where: { id: userId }, data: { primaryFaction: best } });
  }

  return change;
}

export async function readStanding(tx: Tx, userId: string): Promise<FactionStanding> {
  const rows = await tx.playerFaction.findMany({ where: { userId } });
  const standing: FactionStanding = { federation: 0, helix: 0, void: 0 };
  for (const row of rows) {
    if (isFactionId(row.factionId)) standing[row.factionId] = row.reputation;
  }
  return standing;
}

export function standingRanks(standing: FactionStanding): Record<FactionId, number> {
  return {
    federation: rankFor('federation', standing.federation),
    helix: rankFor('helix', standing.helix),
    void: rankFor('void', standing.void),
  };
}

export function standingRankNames(standing: FactionStanding): Record<FactionId, string> {
  const ranks = standingRanks(standing);
  return {
    federation: FACTIONS.federation.rankNames[ranks.federation] ?? 'Unknown',
    helix: FACTIONS.helix.rankNames[ranks.helix] ?? 'Unknown',
    void: FACTIONS.void.rankNames[ranks.void] ?? 'Unknown',
  };
}

export function isFactionId(value: string): value is FactionId {
  return (FACTION_IDS as readonly string[]).includes(value);
}

/** Areas a player of this level may enter. */
export function unlockedAreas(level: number): StationAreaId[] {
  return (Object.entries(AREA_UNLOCK_LEVEL) as [StationAreaId, number][])
    .filter(([, required]) => level >= required)
    .map(([area]) => area);
}

export function areaUnlockLevel(area: StationAreaId): number {
  return AREA_UNLOCK_LEVEL[area] ?? 0;
}

/**
 * Grants any achievement whose threshold the player's counters now meet.
 * Idempotent: a `createMany` with `skipDuplicates` means re-checking is free.
 */
export async function checkAchievements(tx: Tx, userId: string): Promise<string[]> {
  const user = await tx.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      level: true,
      missionsCompleted: true,
      resourcesMined: true,
      creditsEarned: true,
      itemsCrafted: true,
      expeditionsDone: true,
      tradesDone: true,
      distanceWalked: true,
    },
  });
  const assetCount = await tx.blockchainAsset.count({
    where: { owner: (await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { address: true } })).address },
  });

  const metrics: Record<AchievementMetric, number> = {
    level: user.level,
    missions_completed: user.missionsCompleted,
    resources_mined: Number(user.resourcesMined),
    credits_earned: Number(user.creditsEarned),
    items_crafted: user.itemsCrafted,
    expeditions: user.expeditionsDone,
    trades: user.tradesDone,
    distance_walked: user.distanceWalked,
    assets_owned: assetCount,
  };

  const earned = ACHIEVEMENTS.filter((a) => metrics[a.metric] >= a.threshold).map((a) => a.id);
  if (earned.length === 0) return [];

  const existing = await tx.playerAchievement.findMany({
    where: { userId, achievementId: { in: earned } },
    select: { achievementId: true },
  });
  const have = new Set(existing.map((row) => row.achievementId));
  const fresh = earned.filter((id) => !have.has(id));
  if (fresh.length === 0) return [];

  await tx.playerAchievement.createMany({
    data: fresh.map((achievementId) => ({ userId, achievementId })),
    skipDuplicates: true,
  });
  return fresh;
}

export { levelUpCreditReward };
