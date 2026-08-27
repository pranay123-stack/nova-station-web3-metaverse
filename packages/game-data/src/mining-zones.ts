import type { MiningZoneDef } from './types.js';

/**
 * Asteroid fields reachable from the Docking Bay. Each is a separate 3D scene
 * with its own palette, hazard rating and drop table.
 */
export const MINING_ZONES: readonly MiningZoneDef[] = [
  {
    id: 'nova_belt',
    name: 'Nova Belt',
    description:
      'The station’s own debris ring. Picked over for decades, still the safest ore in the system.',
    travelSec: 20,
    distanceAu: 0.2,
    fuelCost: 12,
    requiredLevel: 1,
    hazard: 0.05,
    table: [
      { resource: 'iron', weight: 62 },
      { resource: 'titanium', weight: 28 },
      { resource: 'crystal', weight: 8 },
      { resource: 'platinum', weight: 2 },
    ],
    richness: 1,
    asteroidCount: 46,
    palette: { rock: '#6b6255', fog: '#0b1220', star: '#dbeafe' },
  },
  {
    id: 'kestrel_reach',
    name: 'Kestrel Reach',
    description:
      'A scattered field beyond the ring. Denser metal, and the occasional uncharted rock.',
    travelSec: 35,
    distanceAu: 0.9,
    fuelCost: 24,
    requiredLevel: 4,
    hazard: 0.14,
    table: [
      { resource: 'iron', weight: 40 },
      { resource: 'titanium', weight: 36 },
      { resource: 'platinum', weight: 14 },
      { resource: 'crystal', weight: 9 },
      { resource: 'helium3', weight: 1 },
    ],
    richness: 1.35,
    asteroidCount: 58,
    palette: { rock: '#5d5a6b', fog: '#0a1a24', star: '#bae6fd' },
  },
  {
    id: 'helix_claim',
    name: 'Helix Claim 44',
    description:
      'A corporate lease worked by automated rigs. Helix tolerates freelancers who pay their dues.',
    travelSec: 55,
    distanceAu: 2.4,
    fuelCost: 40,
    requiredLevel: 8,
    hazard: 0.22,
    table: [
      { resource: 'titanium', weight: 34 },
      { resource: 'platinum', weight: 30 },
      { resource: 'crystal', weight: 20 },
      { resource: 'helium3', weight: 14 },
      { resource: 'quantum_shard', weight: 2 },
    ],
    richness: 1.7,
    asteroidCount: 64,
    palette: { rock: '#7a6a4f', fog: '#1a1408', star: '#fde68a' },
    requiredFaction: { faction: 'helix', rank: 2 },
  },
  {
    id: 'the_rift',
    name: 'The Rift',
    description:
      'Where the survey charts stop. Shards here are worth a hull, and the field will happily take one.',
    travelSec: 80,
    distanceAu: 6.1,
    fuelCost: 68,
    requiredLevel: 14,
    hazard: 0.42,
    table: [
      { resource: 'platinum', weight: 26 },
      { resource: 'crystal', weight: 28 },
      { resource: 'helium3', weight: 30 },
      { resource: 'quantum_shard', weight: 16 },
    ],
    richness: 2.4,
    asteroidCount: 72,
    palette: { rock: '#4b3a5c', fog: '#160c22', star: '#e9d5ff' },
    requiredFaction: { faction: 'void', rank: 3 },
  },
];

export const MINING_ZONES_BY_ID: ReadonlyMap<string, MiningZoneDef> = new Map(
  MINING_ZONES.map((z) => [z.id, z]),
);

/**
 * Mining minigame tuning.
 *
 * The client runs a resonance minigame: a target band drifts across a frequency
 * axis and the player holds the beam inside it. The client reports how many
 * ticks it held the band; the server clamps that report to what is physically
 * possible for the elapsed time and converts it to a bounded multiplier. A
 * perfect run is worth `maxMultiplier`; a client claiming an impossible score is
 * clamped, not trusted.
 */
export const MINING_MINIGAME = {
  /** Server tick rate the minigame is scored against. */
  tickHz: 10,
  /** Seconds a single asteroid extraction lasts. */
  extractSec: 12,
  /** Multiplier when the player never holds the band. */
  minMultiplier: 0.55,
  /** Multiplier at a flawless hold. */
  maxMultiplier: 1.45,
  /** Half-width of the resonance band, as a fraction of the axis. */
  bandHalfWidth: 0.11,
  /** Band drift speed in axis-units per second. */
  bandSpeed: 0.42,
  /** How fast the player's beam frequency slews, in axis-units per second. */
  beamSlew: 0.85,
  /** Base units of ore extracted per unit of mining power per second. */
  yieldPerPowerSec: 0.055,
  /** Rare-resource roll bonus per point of sensors, capped. */
  sensorRareBonusPerPoint: 0.0016,
  maxSensorRareBonus: 0.14,
} as const;

/** Fuel burned per second of flight inside a zone. */
export const ZONE_FUEL_BURN_PER_SEC = 0.08;
