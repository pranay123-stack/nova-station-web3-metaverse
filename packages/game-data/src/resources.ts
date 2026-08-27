import type { ResourceDef, ResourceId } from './types.js';

/**
 * The six tradeable materials that drive the whole economy.
 *
 * `baseValue` is the anchor for every credit calculation in the game; the
 * marketplace and the refinery both derive their numbers from it, so tuning the
 * economy is a matter of editing this table and nothing else.
 */
export const RESOURCES: Readonly<Record<ResourceId, ResourceDef>> = {
  iron: {
    id: 'iron',
    name: 'Iron',
    description:
      'Ubiquitous structural metal. Cheap, heavy, and the backbone of every hull plate on the station.',
    rarity: 'common',
    baseValue: 4,
    weight: 1,
    color: '#b0653c',
    emissive: 0.15,
    uses: ['Hull plating', 'Basic modules', 'Station repairs'],
    minLaserTier: 1,
  },
  titanium: {
    id: 'titanium',
    name: 'Titanium',
    description:
      'Light, strong, and stubborn to refine. The standard alloy for ship frames and mining rigs.',
    rarity: 'uncommon',
    baseValue: 14,
    weight: 1.2,
    color: '#c9d4e3',
    emissive: 0.2,
    uses: ['Ship frames', 'Mining lasers', 'Armour'],
    minLaserTier: 1,
  },
  platinum: {
    id: 'platinum',
    name: 'Platinum',
    description:
      'Dense catalytic metal. Traded as much for its industrial use as for its stability as a store of value.',
    rarity: 'rare',
    baseValue: 46,
    weight: 1.6,
    color: '#e8e8f0',
    emissive: 0.35,
    uses: ['Reactor catalysts', 'High-tier modules', 'Trade'],
    minLaserTier: 2,
  },
  crystal: {
    id: 'crystal',
    name: 'Resonant Crystal',
    description:
      'Lattice that hums in sympathy with a mining beam. Essential for sensors and focusing optics.',
    rarity: 'rare',
    baseValue: 62,
    weight: 0.8,
    color: '#5eead4',
    emissive: 1.1,
    uses: ['Sensors', 'Beam optics', 'Research'],
    minLaserTier: 2,
  },
  helium3: {
    id: 'helium3',
    name: 'Helium-3',
    description:
      'Fusion fuel skimmed from regolith and gas pockets. Burns clean and sells fast.',
    rarity: 'epic',
    baseValue: 128,
    weight: 0.4,
    color: '#7dd3fc',
    emissive: 0.9,
    uses: ['Ship fuel', 'Reactors', 'Advanced crafting'],
    minLaserTier: 3,
  },
  quantum_shard: {
    id: 'quantum_shard',
    name: 'Quantum Shard',
    description:
      'A fragment of collapsed spacetime. Nobody at the Lab agrees on what it is, only on what it is worth.',
    rarity: 'legendary',
    baseValue: 640,
    weight: 0.2,
    color: '#c084fc',
    emissive: 1.6,
    uses: ['Legendary modules', 'Station cores', 'On-chain artefacts'],
    minLaserTier: 4,
  },
};

export const RESOURCE_IDS: readonly ResourceId[] = Object.keys(RESOURCES) as ResourceId[];

export function isResourceId(value: string): value is ResourceId {
  return Object.prototype.hasOwnProperty.call(RESOURCES, value);
}

export function getResource(id: ResourceId): ResourceDef {
  return RESOURCES[id];
}
