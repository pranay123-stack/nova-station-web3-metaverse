import {
  MISSIONS_BY_ID,
  type FactionId,
  type MissionDef,
  type MissionObjective,
  type ResourceId,
  type ShipClass,
  type StationAreaId,
} from '@nova/game-data';
import { createRng } from './rng.js';

/** Anything a player does that a mission objective can be measured against. */
export type GameEvent =
  | { readonly kind: 'mined'; readonly resource: ResourceId; readonly amount: number }
  | { readonly kind: 'delivered'; readonly resource: ResourceId; readonly amount: number }
  | { readonly kind: 'visited'; readonly area: StationAreaId }
  | { readonly kind: 'scanned'; readonly zone: string; readonly amount: number }
  | { readonly kind: 'crafted'; readonly recipe: string; readonly amount: number }
  | { readonly kind: 'refined'; readonly amount: number }
  | { readonly kind: 'expedition'; readonly zone: string }
  | { readonly kind: 'sold'; readonly amount: number };

/** Progress counters, one per objective, in objective order. */
export type MissionProgress = readonly number[];

export function initialProgress(mission: MissionDef): MissionProgress {
  return mission.objectives.map(() => 0);
}

export function objectiveTarget(objective: MissionObjective): number {
  switch (objective.kind) {
    case 'visit':
      return 1;
    case 'mine':
    case 'mine_any':
    case 'deliver':
    case 'scan':
    case 'craft':
    case 'refine':
    case 'expedition':
    case 'sell':
      return objective.amount;
    default:
      return 1;
  }
}

function matches(objective: MissionObjective, event: GameEvent): number {
  switch (objective.kind) {
    case 'mine':
      return event.kind === 'mined' && event.resource === objective.resource ? event.amount : 0;
    case 'mine_any':
      return event.kind === 'mined' ? event.amount : 0;
    case 'deliver':
      return event.kind === 'delivered' && event.resource === objective.resource
        ? event.amount
        : 0;
    case 'visit':
      return event.kind === 'visited' && event.area === objective.area ? 1 : 0;
    case 'scan':
      return event.kind === 'scanned' && event.zone === objective.zone ? event.amount : 0;
    case 'craft':
      return event.kind === 'crafted' && event.recipe === objective.recipe ? event.amount : 0;
    case 'refine':
      return event.kind === 'refined' ? event.amount : 0;
    case 'expedition':
      return event.kind === 'expedition' && event.zone === objective.zone ? 1 : 0;
    case 'sell':
      return event.kind === 'sold' ? event.amount : 0;
    default:
      return 0;
  }
}

export interface ProgressUpdate {
  readonly progress: MissionProgress;
  readonly changed: boolean;
  readonly complete: boolean;
}

/**
 * Applies one game event to a mission's progress.
 *
 * Only the server ever calls this, and only from events it generated itself
 * (a resolved mining run, a completed craft, a verified area entry). A client
 * cannot submit progress directly — there is no route that accepts it.
 */
export function applyEvent(
  mission: MissionDef,
  progress: MissionProgress,
  event: GameEvent,
): ProgressUpdate {
  const next = [...progress];
  let changed = false;

  mission.objectives.forEach((objective, index) => {
    const target = objectiveTarget(objective);
    const current = next[index] ?? 0;
    if (current >= target) return;
    const delta = matches(objective, event);
    if (delta <= 0) return;
    next[index] = Math.min(target, current + delta);
    changed = true;
  });

  return { progress: next, changed, complete: isComplete(mission, next) };
}

export function isComplete(mission: MissionDef, progress: MissionProgress): boolean {
  return mission.objectives.every(
    (objective, index) => (progress[index] ?? 0) >= objectiveTarget(objective),
  );
}

export function progressFraction(mission: MissionDef, progress: MissionProgress): number {
  if (mission.objectives.length === 0) return 1;
  const sum = mission.objectives.reduce((acc, objective, index) => {
    const target = objectiveTarget(objective);
    return acc + Math.min(1, (progress[index] ?? 0) / (target || 1));
  }, 0);
  return sum / mission.objectives.length;
}

export type MissionRejection =
  | 'unknown_mission'
  | 'level'
  | 'faction'
  | 'ship_class'
  | 'already_active'
  | 'cooldown'
  | 'not_repeatable'
  | 'too_many_active';

export interface AcceptContext {
  readonly level: number;
  readonly factionRanks: Readonly<Record<FactionId, number>>;
  readonly activeShipClass: ShipClass | null;
  readonly activeMissionCount: number;
  readonly maxActive: number;
  readonly alreadyActive: boolean;
  readonly completedBefore: boolean;
  /** Epoch ms when the same mission was last completed, if ever. */
  readonly lastCompletedAtMs: number | null;
  readonly nowMs: number;
}

export function canAcceptMission(
  missionId: string,
  ctx: AcceptContext,
): { readonly ok: boolean; readonly reason?: MissionRejection; readonly mission?: MissionDef } {
  const mission = MISSIONS_BY_ID.get(missionId);
  if (!mission) return { ok: false, reason: 'unknown_mission' };
  if (ctx.alreadyActive) return { ok: false, reason: 'already_active', mission };
  if (ctx.activeMissionCount >= ctx.maxActive) {
    return { ok: false, reason: 'too_many_active', mission };
  }
  if (ctx.level < mission.requiredLevel) return { ok: false, reason: 'level', mission };
  if ((ctx.factionRanks[mission.faction] ?? 0) < mission.requiredFactionRank) {
    return { ok: false, reason: 'faction', mission };
  }
  if (mission.requiredShipClasses.length > 0) {
    if (!ctx.activeShipClass || !mission.requiredShipClasses.includes(ctx.activeShipClass)) {
      return { ok: false, reason: 'ship_class', mission };
    }
  }
  if (ctx.completedBefore && !mission.repeatable) {
    return { ok: false, reason: 'not_repeatable', mission };
  }
  if (mission.repeatable && ctx.lastCompletedAtMs !== null) {
    const elapsed = (ctx.nowMs - ctx.lastCompletedAtMs) / 1000;
    if (elapsed < mission.cooldownSec) return { ok: false, reason: 'cooldown', mission };
  }
  return { ok: true, mission };
}

export interface ResolvedReward {
  readonly xp: number;
  readonly credits: number;
  readonly reputation: { readonly faction: FactionId; readonly amount: number };
  readonly resources: readonly { readonly resource: ResourceId; readonly amount: number }[];
  readonly rareDrop: { readonly kind: string; readonly id: string } | null;
}

/**
 * Resolves a mission's payout. The rare-drop roll uses a server seed, so the
 * same completion always produces the same reward if it has to be replayed.
 */
export function resolveMissionReward(mission: MissionDef, seed: number): ResolvedReward {
  const rng = createRng(seed);
  const reward = mission.reward;
  let rareDrop: { kind: string; id: string } | null = null;
  if (reward.rareDrop && reward.rareChance && rng.chance(reward.rareChance)) {
    rareDrop = { kind: reward.rareDrop.kind, id: reward.rareDrop.id };
  }
  return {
    xp: reward.xp,
    credits: reward.credits,
    reputation: reward.reputation,
    resources: reward.resources ? [...reward.resources] : [],
    rareDrop,
  };
}

/** Epoch ms at which an accepted mission expires. */
export function missionExpiry(mission: MissionDef, acceptedAtMs: number): number {
  return acceptedAtMs + mission.durationSec * 1000;
}

export function missionExpired(
  mission: MissionDef,
  acceptedAtMs: number,
  nowMs: number,
): boolean {
  return nowMs > missionExpiry(mission, acceptedAtMs);
}
