import {
  MAX_ACTIVE_MISSIONS,
  MISSIONS,
  MISSIONS_BY_ID,
  type FactionId,
  type MissionDef,
  type ShipClass,
} from '@nova/game-data';
import {
  canAcceptMission,
  initialProgress,
  isComplete,
  missionExpiry,
  objectiveTarget,
  resolveMissionReward,
  type MissionRejection,
} from '@nova/game-engine';
import { GameError, type ActiveMissionDto, type MissionOfferDto } from '@nova/shared';
import type { Db, Tx } from '../db/client.js';
import { bigIntToSeed, secureSeed, seedToBigInt } from '../lib/ids.js';
import { secondsUntil } from '../lib/time.js';
import { addItems } from './inventory.js';
import { moveCredits } from './ledger.js';
import { awardReputation, awardXp, readStanding, standingRanks } from './progression.js';
import { activeShip } from './ships.js';

const REJECTION_MESSAGE: Record<MissionRejection, string> = {
  unknown_mission: 'No such mission.',
  level: 'Your level is too low.',
  faction: 'Your standing with this faction is too low.',
  ship_class: 'Your active ship is the wrong class for this contract.',
  already_active: 'You are already running this mission.',
  cooldown: 'This contract is not open again yet.',
  not_repeatable: 'You have already completed this one-off mission.',
  too_many_active: `You can hold at most ${MAX_ACTIVE_MISSIONS} contracts at once.`,
};

/** Lists every mission with whether this player can take it, and why not. */
export async function missionBoard(
  db: Db,
  userId: string,
  faction?: FactionId,
): Promise<MissionOfferDto[]> {
  const user = await db.user.findUniqueOrThrow({
    where: { id: userId },
    select: { level: true },
  });
  const standing = await readStanding(db, userId);
  const ranks = standingRanks(standing);
  const ship = await activeShip(db, userId);
  const history = await db.playerMission.findMany({
    where: { userId },
    select: { missionId: true, status: true, claimedAt: true },
    orderBy: { acceptedAt: 'desc' },
  });

  const active = new Set(
    history.filter((h) => h.status === 'active' || h.status === 'complete').map((h) => h.missionId),
  );
  const lastClaimed = new Map<string, number>();
  const everCompleted = new Set<string>();
  for (const row of history) {
    if (row.status === 'claimed') {
      everCompleted.add(row.missionId);
      if (row.claimedAt && !lastClaimed.has(row.missionId)) {
        lastClaimed.set(row.missionId, row.claimedAt.getTime());
      }
    }
  }

  const nowMs = Date.now();
  const pool = faction ? MISSIONS.filter((m) => m.faction === faction) : MISSIONS;

  return pool.map((mission) => {
    const check = canAcceptMission(mission.id, {
      level: user.level,
      factionRanks: ranks,
      activeShipClass: (ship?.shipClass as ShipClass | undefined) ?? null,
      activeMissionCount: active.size,
      maxActive: MAX_ACTIVE_MISSIONS,
      alreadyActive: active.has(mission.id),
      completedBefore: everCompleted.has(mission.id),
      lastCompletedAtMs: lastClaimed.get(mission.id) ?? null,
      nowMs,
    });

    const last = lastClaimed.get(mission.id);
    const cooldownRemaining =
      last && mission.repeatable
        ? Math.max(0, Math.ceil((last + mission.cooldownSec * 1000 - nowMs) / 1000))
        : 0;

    return {
      mission,
      available: check.ok,
      reason: check.reason ? REJECTION_MESSAGE[check.reason] : null,
      cooldownRemainingSec: cooldownRemaining,
    };
  });
}

export function activeMissionDto(row: {
  id: string;
  missionId: string;
  progress: number[];
  acceptedAt: Date;
  expiresAt: Date;
  status: string;
}): ActiveMissionDto {
  const mission = MISSIONS_BY_ID.get(row.missionId);
  const targets = mission ? mission.objectives.map(objectiveTarget) : [];
  return {
    id: row.id,
    missionId: row.missionId,
    progress: row.progress,
    targets,
    complete: row.status === 'complete',
    acceptedAt: row.acceptedAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    secondsRemaining: secondsUntil(row.expiresAt),
  };
}

export async function activeMissions(db: Db, userId: string): Promise<ActiveMissionDto[]> {
  await expireStale(db, userId);
  const rows = await db.playerMission.findMany({
    where: { userId, status: { in: ['active', 'complete'] } },
    orderBy: { acceptedAt: 'asc' },
    select: {
      id: true,
      missionId: true,
      progress: true,
      acceptedAt: true,
      expiresAt: true,
      status: true,
    },
  });
  return rows.map(activeMissionDto);
}

export async function acceptMission(
  db: Db,
  userId: string,
  missionId: string,
): Promise<ActiveMissionDto> {
  return db.$transaction(async (tx) => {
    const user = await tx.user.findUniqueOrThrow({
      where: { id: userId },
      select: { level: true },
    });
    const standing = await readStanding(tx, userId);
    const ship = await activeShip(tx, userId);

    const history = await tx.playerMission.findMany({
      where: { userId },
      select: { missionId: true, status: true, claimedAt: true },
      orderBy: { acceptedAt: 'desc' },
    });
    const activeRows = history.filter((h) => h.status === 'active' || h.status === 'complete');
    const claimed = history.filter((h) => h.status === 'claimed' && h.missionId === missionId);

    const check = canAcceptMission(missionId, {
      level: user.level,
      factionRanks: standingRanks(standing),
      activeShipClass: (ship?.shipClass as ShipClass | undefined) ?? null,
      activeMissionCount: activeRows.length,
      maxActive: MAX_ACTIVE_MISSIONS,
      alreadyActive: activeRows.some((h) => h.missionId === missionId),
      completedBefore: claimed.length > 0,
      lastCompletedAtMs: claimed[0]?.claimedAt?.getTime() ?? null,
      nowMs: Date.now(),
    });

    if (!check.ok || !check.mission) {
      throw new GameError(
        check.reason === 'level'
          ? 'insufficient_level'
          : check.reason === 'faction'
            ? 'insufficient_reputation'
            : check.reason === 'cooldown'
              ? 'cooldown'
              : check.reason === 'unknown_mission'
                ? 'not_found'
                : 'conflict',
        REJECTION_MESSAGE[check.reason ?? 'unknown_mission'],
      );
    }

    const mission = check.mission;
    const acceptedAt = new Date();
    const row = await tx.playerMission.create({
      data: {
        userId,
        missionId: mission.id,
        progress: [...initialProgress(mission)],
        acceptedAt,
        expiresAt: new Date(missionExpiry(mission, acceptedAt.getTime())),
        // The reward seed is fixed now, not at completion: the payout for this
        // attempt is decided before the player can influence anything.
        rewardSeed: seedToBigInt(secureSeed()),
      },
      select: {
        id: true,
        missionId: true,
        progress: true,
        acceptedAt: true,
        expiresAt: true,
        status: true,
      },
    });
    return activeMissionDto(row);
  });
}

export async function abandonMission(db: Db, userId: string, playerMissionId: string): Promise<void> {
  const updated = await db.playerMission.updateMany({
    where: { id: playerMissionId, userId, status: { in: ['active', 'complete'] } },
    data: { status: 'abandoned' },
  });
  if (updated.count !== 1) throw new GameError('not_found', 'No such active contract.');
}

export interface ClaimResult {
  readonly mission: MissionDef;
  readonly xp: number;
  readonly credits: number;
  readonly reputation: { faction: FactionId; amount: number };
  readonly resources: readonly { resource: string; amount: number }[];
  readonly rareDrop: { kind: string; id: string } | null;
  readonly levelsGained: number;
  readonly newLevel: number;
  readonly unlockedAchievements: readonly string[];
}

/**
 * Pays out a completed contract.
 *
 * The status transition is a conditional update from `complete` to `claimed`,
 * so two simultaneous claims cannot both pay: the second finds nothing in the
 * `complete` state to move.
 */
export async function claimMission(
  db: Db,
  userId: string,
  playerMissionId: string,
): Promise<ClaimResult> {
  return db.$transaction(async (tx) => {
    const row = await tx.playerMission.findFirst({
      where: { id: playerMissionId, userId },
      select: {
        id: true,
        missionId: true,
        progress: true,
        status: true,
        expiresAt: true,
        rewardSeed: true,
      },
    });
    if (!row) throw new GameError('not_found', 'No such contract.');

    const mission = MISSIONS_BY_ID.get(row.missionId);
    if (!mission) throw new GameError('internal_error', 'Mission definition is missing.');

    if (row.status !== 'complete') {
      if (row.status === 'active' && !isComplete(mission, row.progress)) {
        throw new GameError('not_active', 'That contract is not complete yet.');
      }
      if (row.status !== 'active') {
        throw new GameError('conflict', 'That contract has already been settled.');
      }
    }
    if (row.expiresAt.getTime() < Date.now()) {
      await tx.playerMission.update({ where: { id: row.id }, data: { status: 'expired' } });
      throw new GameError('expired', 'That contract expired before you claimed it.');
    }

    const settled = await tx.playerMission.updateMany({
      where: { id: row.id, userId, status: { in: ['active', 'complete'] } },
      data: { status: 'claimed', claimedAt: new Date(), completedAt: new Date() },
    });
    if (settled.count !== 1) {
      throw new GameError('conflict', 'That contract has already been settled.');
    }

    const reward = resolveMissionReward(mission, bigIntToSeed(row.rewardSeed));

    await moveCredits(tx, {
      userId,
      kind: 'mission',
      delta: BigInt(reward.credits),
      reason: `Contract: ${mission.title}`,
      refId: row.id,
    });

    if (reward.resources.length > 0) {
      await addItems(
        tx,
        userId,
        reward.resources.map((r) => ({ kind: 'resource' as const, defId: r.resource, amount: r.amount })),
      );
    }
    if (reward.rareDrop) {
      await addItems(tx, userId, [
        {
          kind: reward.rareDrop.kind as 'module' | 'equipment' | 'cosmetic' | 'resource',
          defId: reward.rareDrop.id,
          amount: 1,
        },
      ]);
    }

    await tx.user.update({
      where: { id: userId },
      data: { missionsCompleted: { increment: 1 } },
    });
    await awardReputation(tx, userId, reward.reputation.faction, reward.reputation.amount);
    const progression = await awardXp(tx, userId, reward.xp);

    return {
      mission,
      xp: reward.xp,
      credits: reward.credits,
      reputation: reward.reputation,
      resources: reward.resources,
      rareDrop: reward.rareDrop,
      levelsGained: progression.levelsGained,
      newLevel: progression.level,
      unlockedAchievements: progression.unlockedAchievements,
    };
  });
}

/** Marks any of this player's contracts whose deadline has passed. */
export async function expireStale(tx: Tx, userId: string): Promise<number> {
  const result = await tx.playerMission.updateMany({
    where: { userId, status: 'active', expiresAt: { lt: new Date() } },
    data: { status: 'expired' },
  });
  return result.count;
}
