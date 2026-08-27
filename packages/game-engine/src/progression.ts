import {
  FACTIONS,
  FACTION_CROSS_EFFECT,
  FACTION_IDS,
  MAX_FACTION_RANK,
  MAX_LEVEL,
  levelForXp,
  levelUpCreditReward,
  totalXpForLevel,
  xpToNextLevel,
  type FactionId,
} from '@nova/game-data';

export interface XpGain {
  readonly xp: number;
  readonly level: number;
  readonly levelsGained: number;
  readonly creditBonus: number;
  readonly xpIntoLevel: number;
  readonly xpForLevel: number;
}

/** Applies an XP award and reports any level-ups it caused. */
export function applyXp(currentXp: number, gain: number): XpGain {
  const before = levelForXp(currentXp);
  const xp = Math.max(0, Math.floor(currentXp + Math.max(0, Math.floor(gain))));
  const after = levelForXp(xp);
  let creditBonus = 0;
  for (let level = before + 1; level <= after; level += 1) {
    creditBonus += levelUpCreditReward(level);
  }
  const base = totalXpForLevel(after);
  return {
    xp,
    level: after,
    levelsGained: after - before,
    creditBonus,
    xpIntoLevel: xp - base,
    xpForLevel: after >= MAX_LEVEL ? 0 : xpToNextLevel(after),
  };
}

export type FactionStanding = Record<FactionId, number>;

export function emptyStanding(): FactionStanding {
  return { federation: 0, helix: 0, void: 0 };
}

export interface ReputationChange {
  readonly standing: FactionStanding;
  readonly deltas: FactionStanding;
  readonly ranksGained: Partial<Record<FactionId, number>>;
}

/**
 * Awards reputation to one faction and propagates the cross-faction effect.
 *
 * Working for the Syndicate genuinely costs you with the Federation, which is
 * what makes the faction choice a decision rather than a checklist.
 */
export function applyReputation(
  standing: FactionStanding,
  faction: FactionId,
  amount: number,
): ReputationChange {
  const next: FactionStanding = { ...standing };
  const deltas: FactionStanding = emptyStanding();
  const ranksGained: Partial<Record<FactionId, number>> = {};
  const effects = FACTION_CROSS_EFFECT[faction];

  for (const target of FACTION_IDS) {
    const factor = effects[target] ?? 0;
    if (factor === 0) continue;
    const delta = Math.round(amount * factor);
    if (delta === 0) continue;
    const before = rankFor(target, next[target]);
    next[target] = Math.max(0, next[target] + delta);
    deltas[target] = delta;
    const after = rankFor(target, next[target]);
    if (after > before) ranksGained[target] = after - before;
  }
  return { standing: next, deltas, ranksGained };
}

/** Rank index (0..MAX_FACTION_RANK) for a reputation total. */
export function rankFor(faction: FactionId, reputation: number): number {
  const thresholds = FACTIONS[faction].rankThresholds;
  let rank = 0;
  for (let i = 0; i < thresholds.length; i += 1) {
    const threshold = thresholds[i];
    if (threshold === undefined) break;
    if (reputation >= threshold) rank = i;
    else break;
  }
  return Math.min(rank, MAX_FACTION_RANK);
}

export function rankName(faction: FactionId, reputation: number): string {
  return FACTIONS[faction].rankNames[rankFor(faction, reputation)] ?? 'Unknown';
}

export interface RankProgress {
  readonly rank: number;
  readonly name: string;
  readonly current: number;
  readonly rankFloor: number;
  readonly rankCeiling: number | null;
  readonly fraction: number;
}

export function rankProgress(faction: FactionId, reputation: number): RankProgress {
  const def = FACTIONS[faction];
  const rank = rankFor(faction, reputation);
  const floor = def.rankThresholds[rank] ?? 0;
  const ceiling = rank >= MAX_FACTION_RANK ? null : (def.rankThresholds[rank + 1] ?? null);
  const fraction =
    ceiling === null ? 1 : Math.min(1, (reputation - floor) / Math.max(1, ceiling - floor));
  return {
    rank,
    name: def.rankNames[rank] ?? 'Unknown',
    current: reputation,
    rankFloor: floor,
    rankCeiling: ceiling,
    fraction,
  };
}

/** Marketplace fee discount earned from a faction's standing, as a fraction. */
export function feeDiscountFor(standing: FactionStanding): number {
  let best = 0;
  for (const faction of FACTION_IDS) {
    const progress = rankFor(faction, standing[faction]);
    const discount = (progress / MAX_FACTION_RANK) * FACTIONS[faction].maxFeeDiscount;
    if (discount > best) best = discount;
  }
  return Math.round(best * 1000) / 1000;
}

export function standingRanks(standing: FactionStanding): Record<FactionId, number> {
  return {
    federation: rankFor('federation', standing.federation),
    helix: rankFor('helix', standing.helix),
    void: rankFor('void', standing.void),
  };
}
