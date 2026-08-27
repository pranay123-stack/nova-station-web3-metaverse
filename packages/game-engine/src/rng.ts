/**
 * Deterministic RNG.
 *
 * Every random outcome that affects the economy is produced here, on the
 * server, from a seed the client never sees. Determinism means a disputed roll
 * can be replayed exactly from the stored seed, which is what makes the reward
 * pipeline auditable.
 */
export interface Rng {
  /** Uniform in [0, 1). */
  next(): number;
  /** Integer in [min, max]. */
  int(min: number, max: number): number;
  /** Uniform in [min, max). */
  range(min: number, max: number): number;
  /** True with probability `p`. */
  chance(p: number): boolean;
  /** Weighted pick. Returns `null` only for an empty or zero-weight table. */
  pick<T>(items: readonly T[], weight: (item: T) => number): T | null;
  /** Number of raw draws taken so far; useful for audit records. */
  draws(): number;
}

/** mulberry32 — small, fast, and good enough for game rolls. */
export function createRng(seed: number): Rng {
  let state = seed >>> 0;
  let count = 0;
  const next = (): number => {
    count += 1;
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min, max) => Math.floor(next() * (max - min + 1)) + min,
    range: (min, max) => min + next() * (max - min),
    chance: (p) => next() < p,
    pick<T>(items: readonly T[], weight: (item: T) => number): T | null {
      let total = 0;
      for (const item of items) total += Math.max(0, weight(item));
      if (total <= 0) return null;
      let roll = next() * total;
      for (const item of items) {
        roll -= Math.max(0, weight(item));
        if (roll <= 0) return item;
      }
      return items[items.length - 1] ?? null;
    },
    draws: () => count,
  };
}

/** FNV-1a: turns a session id or address into a usable numeric seed. */
export function hashSeed(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Combines a base seed with a counter so one session yields independent streams. */
export function deriveSeed(base: number, counter: number): number {
  return (Math.imul(base ^ (counter + 0x9e3779b9), 0x85ebca6b) >>> 0) ^ (counter * 0x27d4eb2d);
}
