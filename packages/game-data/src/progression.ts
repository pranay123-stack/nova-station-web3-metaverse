/**
 * Level curve, energy, and reputation ranks.
 *
 * The XP curve is quadratic-ish: `xpForLevel(n)` is the *total* XP needed to be
 * level `n`. It is deliberately a closed-form function so the server can verify
 * any level claim in constant time.
 */

export const MAX_LEVEL = 40;

const XP_BASE = 220;
const XP_GROWTH = 1.28;

/** Total XP required to have reached `level`. Level 1 requires 0. */
export function totalXpForLevel(level: number): number {
  if (level <= 1) return 0;
  const capped = Math.min(level, MAX_LEVEL);
  let total = 0;
  for (let n = 1; n < capped; n += 1) {
    total += Math.round(XP_BASE * Math.pow(XP_GROWTH, n - 1));
  }
  return total;
}

/** XP needed to go from `level` to `level + 1`. */
export function xpToNextLevel(level: number): number {
  if (level >= MAX_LEVEL) return 0;
  return totalXpForLevel(level + 1) - totalXpForLevel(level);
}

/** The level implied by a total XP amount. Always in [1, MAX_LEVEL]. */
export function levelForXp(totalXp: number): number {
  const xp = Math.max(0, Math.floor(totalXp));
  let level = 1;
  while (level < MAX_LEVEL && xp >= totalXpForLevel(level + 1)) {
    level += 1;
  }
  return level;
}

/** Precomputed table for UI display. Index `i` holds the total XP for level `i + 1`. */
export const XP_TABLE: readonly number[] = Array.from({ length: MAX_LEVEL }, (_, i) =>
  totalXpForLevel(i + 1),
);

/** Base personal stats before equipment. */
export const BASE_PLAYER_STATS = {
  walkSpeed: 4.6,
  runMultiplier: 1.85,
  jumpVelocity: 7.2,
  energyMax: 100,
  energyRegen: 4,
  /** Energy drained per second while sprinting. */
  sprintDrain: 9,
  /** Energy spent per jump. */
  jumpCost: 6,
  healthMax: 100,
  scanRange: 8,
} as const;

/** Station areas unlock as the player levels up. */
export const AREA_UNLOCK_LEVEL = {
  habitat: 0,
  market: 0,
  hangar: 0,
  mining_bay: 0,
  docking_bay: 2,
  lab: 4,
  command_deck: 6,
  corridor: 0,
} as const;

/** Credits granted the first time a player signs in. */
export const STARTING_CREDITS = 2500;

/** How many credits a level-up grants, scaled by the new level. */
export function levelUpCreditReward(newLevel: number): number {
  return 250 + newLevel * 120;
}
