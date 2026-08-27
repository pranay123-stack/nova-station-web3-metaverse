import type { ShipClass, ShipDef, ShipStats } from './types.js';

/**
 * Hangar catalogue. Stats here are the *base* values; the effective stats of an
 * owned ship are base + upgrade tiers + equipped modules, computed by
 * `@nova/game-engine`.
 */
export const SHIPS: readonly ShipDef[] = [
  {
    id: 'kestrel',
    name: 'Kestrel',
    shipClass: 'scout',
    description:
      'The ship every commander starts with. Fast, fragile, and honest about both.',
    rarity: 'common',
    manufacturer: 'Nova Yards',
    baseStats: { speed: 42, cargo: 60, fuel: 100, miningPower: 8, defense: 6, sensors: 30 },
    moduleSlots: 2,
    creditPrice: 0,
    requiredLevel: 1,
    palette: { hull: '#8f9bb3', trim: '#38bdf8', glow: '#7dd3fc' },
    silhouette: 'dart',
  },
  {
    id: 'pickaxe',
    name: 'Pickaxe MK II',
    shipClass: 'miner',
    description:
      'A drill with a cockpit bolted on. Helix Corporation sells them by the thousand and nobody complains.',
    rarity: 'common',
    manufacturer: 'Helix Industrial',
    baseStats: { speed: 26, cargo: 180, fuel: 140, miningPower: 26, defense: 10, sensors: 18 },
    moduleSlots: 3,
    creditPrice: 4800,
    requiredLevel: 3,
    palette: { hull: '#c9843c', trim: '#f5b942', glow: '#fbbf24' },
    silhouette: 'rig',
  },
  {
    id: 'mule',
    name: 'Mule-7',
    shipClass: 'transport',
    description:
      'Enormous hold, unremarkable everything else. The reason the market never runs dry.',
    rarity: 'uncommon',
    manufacturer: 'Helix Industrial',
    baseStats: { speed: 22, cargo: 420, fuel: 220, miningPower: 10, defense: 18, sensors: 16 },
    moduleSlots: 3,
    creditPrice: 12500,
    requiredLevel: 6,
    palette: { hull: '#7a8494', trim: '#a3e635', glow: '#bef264' },
    silhouette: 'hauler',
  },
  {
    id: 'meridian',
    name: 'Meridian',
    shipClass: 'explorer',
    description:
      'Federation survey platform. Sensor mast longer than most scouts are, top to tail.',
    rarity: 'rare',
    manufacturer: 'Federation Survey Corps',
    baseStats: { speed: 38, cargo: 220, fuel: 300, miningPower: 20, defense: 22, sensors: 72 },
    moduleSlots: 4,
    creditPrice: 34000,
    requiredLevel: 10,
    requiredFaction: { faction: 'federation', rank: 3 },
    palette: { hull: '#dbe6f2', trim: '#60a5fa', glow: '#93c5fd' },
    silhouette: 'wing',
  },
  {
    id: 'harrow',
    name: 'Harrow',
    shipClass: 'combat',
    description:
      'Void Syndicate escort. Officially it does not exist; unofficially it is docked in bay four.',
    rarity: 'epic',
    manufacturer: 'Void Syndicate',
    baseStats: { speed: 46, cargo: 120, fuel: 240, miningPower: 14, defense: 58, sensors: 40 },
    moduleSlots: 4,
    creditPrice: 68000,
    requiredLevel: 14,
    requiredFaction: { faction: 'void', rank: 3 },
    palette: { hull: '#2f3542', trim: '#f43f5e', glow: '#fb7185' },
    silhouette: 'lance',
  },
  {
    id: 'aurora',
    name: 'Aurora Prime',
    shipClass: 'explorer',
    description:
      'One hull in twelve. Awarded, never sold — and the registry that proves it lives on-chain.',
    rarity: 'legendary',
    manufacturer: 'Nova Yards (Bespoke)',
    baseStats: { speed: 54, cargo: 320, fuel: 380, miningPower: 38, defense: 46, sensors: 96 },
    moduleSlots: 5,
    creditPrice: null,
    requiredLevel: 18,
    palette: { hull: '#f4f0ff', trim: '#c084fc', glow: '#e9d5ff' },
    silhouette: 'wing',
  },
];

export const SHIPS_BY_ID: ReadonlyMap<string, ShipDef> = new Map(SHIPS.map((s) => [s.id, s]));

export const STARTER_SHIP_ID = 'kestrel';

export const SHIP_CLASS_LABEL: Readonly<Record<ShipClass, string>> = {
  scout: 'Scout',
  miner: 'Miner',
  transport: 'Transport',
  explorer: 'Explorer',
  combat: 'Combat',
};

export const EMPTY_STATS: ShipStats = {
  speed: 0,
  cargo: 0,
  fuel: 0,
  miningPower: 0,
  defense: 0,
  sensors: 0,
};

export const SHIP_STAT_KEYS: readonly (keyof ShipStats)[] = [
  'speed',
  'cargo',
  'fuel',
  'miningPower',
  'defense',
  'sensors',
];

export const SHIP_STAT_LABEL: Readonly<Record<keyof ShipStats, string>> = {
  speed: 'Speed',
  cargo: 'Cargo',
  fuel: 'Fuel',
  miningPower: 'Mining',
  defense: 'Defense',
  sensors: 'Sensors',
};

/**
 * Upgrade economics. A ship has one upgrade track per stat; each tier adds
 * `UPGRADE_STAT_STEP` of the ship's base value for that stat, and costs
 * geometrically more than the last.
 */
export const MAX_UPGRADE_TIER = 5;
export const UPGRADE_STAT_STEP = 0.12;
export const UPGRADE_BASE_CREDIT_COST = 900;
export const UPGRADE_COST_GROWTH = 1.85;

/** Resource cost per upgrade tier, scaled by tier index. */
export const UPGRADE_RESOURCE_COST = [
  { resource: 'iron', amount: 20 },
  { resource: 'titanium', amount: 8 },
] as const;

/** The laser tier of a ship, derived from mining power. Gates rare resources. */
export function laserTierForMiningPower(miningPower: number): number {
  if (miningPower >= 60) return 4;
  if (miningPower >= 34) return 3;
  if (miningPower >= 18) return 2;
  return 1;
}
