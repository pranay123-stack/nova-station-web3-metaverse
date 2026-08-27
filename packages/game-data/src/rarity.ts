import type { Rarity } from './types.js';

export const RARITY_ORDER: readonly Rarity[] = [
  'common',
  'uncommon',
  'rare',
  'epic',
  'legendary',
] as const;

export const RARITY_RANK: Readonly<Record<Rarity, number>> = {
  common: 0,
  uncommon: 1,
  rare: 2,
  epic: 3,
  legendary: 4,
};

export const RARITY_COLOR: Readonly<Record<Rarity, string>> = {
  common: '#9aa7b8',
  uncommon: '#4ade80',
  rare: '#38bdf8',
  epic: '#c084fc',
  legendary: '#fbbf24',
};

export const RARITY_LABEL: Readonly<Record<Rarity, string>> = {
  common: 'Common',
  uncommon: 'Uncommon',
  rare: 'Rare',
  epic: 'Epic',
  legendary: 'Legendary',
};

/** Multiplier applied to base credit values when pricing an item of this rarity. */
export const RARITY_VALUE_MULTIPLIER: Readonly<Record<Rarity, number>> = {
  common: 1,
  uncommon: 1.8,
  rare: 3.5,
  epic: 7,
  legendary: 15,
};

export function compareRarity(a: Rarity, b: Rarity): number {
  return RARITY_RANK[a] - RARITY_RANK[b];
}
