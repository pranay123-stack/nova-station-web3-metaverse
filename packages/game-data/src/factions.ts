import type { FactionDef, FactionId } from './types.js';

/** Reputation thresholds shared by all three factions. */
const RANK_THRESHOLDS = [0, 250, 750, 1800, 3600, 6500, 11000, 18000] as const;

export const REPUTATION_RANK_NAMES = [
  'Unknown',
  'Visitor',
  'Citizen',
  'Trader',
  'Explorer',
  'Elite',
  'Commander',
  'Legend',
] as const;

export const MAX_FACTION_RANK = RANK_THRESHOLDS.length - 1;

export const FACTIONS: Readonly<Record<FactionId, FactionDef>> = {
  federation: {
    id: 'federation',
    name: 'Terran Federation',
    motto: 'Knowledge before profit.',
    description:
      'The chartering authority behind Nova Station. Runs the Laboratory, funds survey work, and takes a dim view of unlicensed salvage.',
    color: '#60a5fa',
    accent: '#dbeafe',
    maxFeeDiscount: 0.15,
    rankThresholds: RANK_THRESHOLDS,
    rankNames: REPUTATION_RANK_NAMES,
  },
  helix: {
    id: 'helix',
    name: 'Helix Corporation',
    motto: 'Every gram accounted for.',
    description:
      'Owns the Mining Bay leases and half the hulls in the Hangar. Pays reliably, negotiates ruthlessly, and never forgets a shortfall.',
    color: '#fbbf24',
    accent: '#fef3c7',
    maxFeeDiscount: 0.2,
    rankThresholds: RANK_THRESHOLDS,
    rankNames: REPUTATION_RANK_NAMES,
  },
  void: {
    id: 'void',
    name: 'Void Syndicate',
    motto: 'No manifest, no questions.',
    description:
      'Not on any station charter, yet somehow always holding a booth in the Market. Dangerous work, uncommon rewards.',
    color: '#f43f5e',
    accent: '#ffe4e6',
    maxFeeDiscount: 0.25,
    rankThresholds: RANK_THRESHOLDS,
    rankNames: REPUTATION_RANK_NAMES,
  },
};

export const FACTION_IDS: readonly FactionId[] = ['federation', 'helix', 'void'];

export function isFactionId(value: string): value is FactionId {
  return (FACTION_IDS as readonly string[]).includes(value);
}

/**
 * Standing with one faction bleeds into the others. Doing Syndicate work costs
 * you with the Federation, which is what makes faction choice meaningful.
 */
export const FACTION_CROSS_EFFECT: Readonly<Record<FactionId, Readonly<Record<FactionId, number>>>> =
  {
    federation: { federation: 1, helix: 0, void: -0.35 },
    helix: { federation: 0, helix: 1, void: -0.1 },
    void: { federation: -0.35, helix: -0.1, void: 1 },
  };
