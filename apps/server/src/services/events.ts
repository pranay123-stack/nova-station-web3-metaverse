import { MISSIONS_BY_ID, type ResourceId, type StationAreaId } from '@nova/game-data';
import { applyEvent, isComplete, type GameEvent } from '@nova/game-engine';
import type { Tx } from '../db/client.js';
import { checkAchievements } from './progression.js';

/**
 * The bridge between "something happened" and "a mission advanced".
 *
 * Only server code calls this, and only with events it produced itself: a
 * resolved mining run, a completed craft, a verified area entry. There is no
 * route through which a client can report progress, which is why mission
 * rewards cannot be farmed by replaying a request.
 */
export async function recordEvent(tx: Tx, userId: string, event: GameEvent): Promise<string[]> {
  await bumpCounters(tx, userId, event);

  const active = await tx.playerMission.findMany({
    where: { userId, status: 'active' },
    select: { id: true, missionId: true, progress: true, expiresAt: true },
  });

  const nowMs = Date.now();
  const completed: string[] = [];

  for (const row of active) {
    const mission = MISSIONS_BY_ID.get(row.missionId);
    if (!mission) continue;

    if (row.expiresAt.getTime() < nowMs) {
      await tx.playerMission.update({ where: { id: row.id }, data: { status: 'expired' } });
      continue;
    }

    const update = applyEvent(mission, row.progress, event);
    if (!update.changed) continue;

    const done = isComplete(mission, update.progress);
    await tx.playerMission.update({
      where: { id: row.id },
      data: {
        progress: [...update.progress],
        ...(done ? { status: 'complete', completedAt: new Date() } : {}),
      },
    });
    if (done) completed.push(row.id);
  }

  await checkAchievements(tx, userId);
  return completed;
}

/** Lifetime counters, used for achievements, the profile and the leaderboard. */
async function bumpCounters(tx: Tx, userId: string, event: GameEvent): Promise<void> {
  switch (event.kind) {
    case 'mined':
      await tx.user.update({
        where: { id: userId },
        data: { resourcesMined: { increment: BigInt(Math.max(0, event.amount)) } },
      });
      break;
    case 'expedition':
      await tx.user.update({
        where: { id: userId },
        data: { expeditionsDone: { increment: 1 } },
      });
      break;
    case 'crafted':
      await tx.user.update({
        where: { id: userId },
        data: { itemsCrafted: { increment: Math.max(0, event.amount) } },
      });
      break;
    case 'sold':
      await tx.user.update({
        where: { id: userId },
        data: { tradesDone: { increment: Math.max(0, event.amount) } },
      });
      break;
    default:
      break;
  }
}

export const events = {
  mined: (resource: ResourceId, amount: number): GameEvent => ({ kind: 'mined', resource, amount }),
  delivered: (resource: ResourceId, amount: number): GameEvent => ({
    kind: 'delivered',
    resource,
    amount,
  }),
  visited: (area: StationAreaId): GameEvent => ({ kind: 'visited', area }),
  scanned: (zone: string, amount = 1): GameEvent => ({ kind: 'scanned', zone, amount }),
  crafted: (recipe: string, amount = 1): GameEvent => ({ kind: 'crafted', recipe, amount }),
  refined: (amount: number): GameEvent => ({ kind: 'refined', amount }),
  expedition: (zone: string): GameEvent => ({ kind: 'expedition', zone }),
  sold: (amount = 1): GameEvent => ({ kind: 'sold', amount }),
} as const;
