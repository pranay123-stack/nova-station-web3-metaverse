/**
 * Core content types for NOVA STATION.
 *
 * Everything in this package is *static content data*: it never changes at
 * runtime and is identical on the client and on the server. The server treats
 * this data as the authority for every economic calculation; the client uses it
 * for rendering and for optimistic UI only.
 */

export type Vec3 = readonly [number, number, number];
export type Vec2 = readonly [number, number];

/** Rarity tiers, ordered from most common to most rare. */
export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

export type ResourceId =
  | 'iron'
  | 'titanium'
  | 'platinum'
  | 'crystal'
  | 'helium3'
  | 'quantum_shard';

export interface ResourceDef {
  readonly id: ResourceId;
  /** Display name. */
  readonly name: string;
  readonly description: string;
  readonly rarity: Rarity;
  /** Baseline credit value of a single unit, before market modifiers. */
  readonly baseValue: number;
  /** Cargo weight of a single unit, in cargo units. */
  readonly weight: number;
  /** Hex color used for icons, ore veins and particle effects. */
  readonly color: string;
  /** Emissive intensity used when rendering ore veins. */
  readonly emissive: number;
  readonly uses: readonly string[];
  /**
   * Minimum mining-laser tier required to extract this resource at all.
   * Ships below this tier simply never roll the resource.
   */
  readonly minLaserTier: number;
}

export type ShipClass = 'scout' | 'miner' | 'transport' | 'explorer' | 'combat';

export interface ShipStats {
  /** Flight speed in metres/second. */
  readonly speed: number;
  /** Cargo capacity, in cargo units. */
  readonly cargo: number;
  /** Fuel tank size. */
  readonly fuel: number;
  /** Mining power; scales extraction rate. */
  readonly miningPower: number;
  /** Defense; reduces expedition hazard damage. */
  readonly defense: number;
  /** Sensor range; improves rare-resource detection and exploration missions. */
  readonly sensors: number;
}

export interface ShipDef {
  readonly id: string;
  readonly name: string;
  readonly shipClass: ShipClass;
  readonly description: string;
  readonly rarity: Rarity;
  readonly manufacturer: string;
  readonly baseStats: ShipStats;
  /** Number of module slots at tier 0. */
  readonly moduleSlots: number;
  /** Credit price in the hangar; `null` means it is not purchasable with credits. */
  readonly creditPrice: number | null;
  /** Level required to fly the ship. */
  readonly requiredLevel: number;
  /** Optional faction reputation gate. */
  readonly requiredFaction?: { readonly faction: FactionId; readonly rank: number };
  /** Palette used by the procedural ship mesh. */
  readonly palette: { readonly hull: string; readonly trim: string; readonly glow: string };
  /** Procedural mesh silhouette selector. */
  readonly silhouette: 'dart' | 'hauler' | 'rig' | 'wing' | 'lance';
}

export type ModuleSlotKind = 'weapon' | 'mining' | 'engine' | 'shield' | 'cargo' | 'utility';

export interface ModuleDef {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly slot: ModuleSlotKind;
  readonly rarity: Rarity;
  /** Additive stat deltas applied to the ship. */
  readonly stats: Partial<ShipStats>;
  /** Multiplicative stat modifiers (1.0 = no change). */
  readonly multipliers?: Partial<ShipStats>;
  readonly craftableWith?: string;
  readonly creditPrice: number | null;
  /** True when the module is expected to live on-chain as an ERC-1155 item. */
  readonly onChainEligible: boolean;
}

export type EquipmentSlotKind = 'suit' | 'helmet' | 'tool' | 'badge';

export interface EquipmentDef {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly slot: EquipmentSlotKind;
  readonly rarity: Rarity;
  /** Personal stat deltas: these affect station gameplay, not combat power. */
  readonly stats: {
    readonly walkSpeed?: number;
    readonly energyMax?: number;
    readonly energyRegen?: number;
    readonly scanRange?: number;
    readonly refineYield?: number;
  };
  readonly creditPrice: number | null;
  readonly onChainEligible: boolean;
}

export type CosmeticSlot = 'suitPattern' | 'visor' | 'emblem' | 'trail' | 'accessory';

export interface CosmeticDef {
  readonly id: string;
  readonly name: string;
  readonly slot: CosmeticSlot;
  readonly rarity: Rarity;
  /** Renderer hint consumed by the avatar builder. */
  readonly render: Record<string, string | number>;
  readonly creditPrice: number | null;
  readonly onChainEligible: boolean;
}

export interface RecipeInput {
  readonly resource: ResourceId;
  readonly amount: number;
}

export type CraftOutputKind = 'module' | 'equipment' | 'cosmetic' | 'resource';

export interface RecipeDef {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly inputs: readonly RecipeInput[];
  /** Credits consumed on top of the resource inputs. */
  readonly creditCost: number;
  readonly output: {
    readonly kind: CraftOutputKind;
    readonly id: string;
    readonly amount: number;
  };
  /** Seconds the craft occupies a lab bench. */
  readonly durationSec: number;
  readonly requiredLevel: number;
  /** Station area where the recipe can be started. */
  readonly station: StationAreaId;
  readonly requiredFaction?: { readonly faction: FactionId; readonly rank: number };
  /** 0..1 probability of producing one extra unit (research bonus). */
  readonly bonusChance: number;
}

export type FactionId = 'federation' | 'helix' | 'void';

export interface FactionDef {
  readonly id: FactionId;
  readonly name: string;
  readonly motto: string;
  readonly description: string;
  readonly color: string;
  readonly accent: string;
  /** Market fee discount at maximum standing, as a fraction (0.15 = 15% off fees). */
  readonly maxFeeDiscount: number;
  /** Rank thresholds in reputation points. Index 0 is always 0. */
  readonly rankThresholds: readonly number[];
  readonly rankNames: readonly string[];
}

export type MissionType =
  | 'mining'
  | 'exploration'
  | 'delivery'
  | 'recovery'
  | 'rescue'
  | 'combat'
  | 'research'
  | 'trade';

export type MissionObjective =
  | { readonly kind: 'mine'; readonly resource: ResourceId; readonly amount: number }
  | { readonly kind: 'mine_any'; readonly amount: number }
  | { readonly kind: 'deliver'; readonly resource: ResourceId; readonly amount: number }
  | { readonly kind: 'visit'; readonly area: StationAreaId }
  | { readonly kind: 'scan'; readonly zone: string; readonly amount: number }
  | { readonly kind: 'craft'; readonly recipe: string; readonly amount: number }
  | { readonly kind: 'refine'; readonly amount: number }
  | { readonly kind: 'expedition'; readonly zone: string; readonly amount: number }
  | { readonly kind: 'sell'; readonly amount: number };

export interface MissionReward {
  readonly xp: number;
  readonly credits: number;
  readonly reputation: { readonly faction: FactionId; readonly amount: number };
  readonly resources?: readonly RecipeInput[];
  /** Probability 0..1 of an extra rare drop, resolved server-side. */
  readonly rareChance?: number;
  readonly rareDrop?: { readonly kind: CraftOutputKind; readonly id: string };
}

export interface MissionDef {
  readonly id: string;
  /** Stable numeric code used for the in-fiction "MISSION #042" display. */
  readonly code: number;
  readonly title: string;
  readonly summary: string;
  readonly briefing: string;
  readonly type: MissionType;
  /** 1..5 stars. */
  readonly difficulty: number;
  readonly faction: FactionId;
  readonly requiredLevel: number;
  readonly requiredFactionRank: number;
  /** Ship classes able to accept the mission; empty means any. */
  readonly requiredShipClasses: readonly ShipClass[];
  readonly objectives: readonly MissionObjective[];
  /** Soft time limit in seconds; the mission expires when it elapses. */
  readonly durationSec: number;
  readonly reward: MissionReward;
  /** 0..1 hazard rating, used for expedition risk and flavour. */
  readonly risk: number;
  readonly repeatable: boolean;
  /** Cooldown before a repeatable mission can be accepted again. */
  readonly cooldownSec: number;
}

export type StationAreaId =
  | 'command_deck'
  | 'hangar'
  | 'market'
  | 'lab'
  | 'habitat'
  | 'mining_bay'
  | 'docking_bay'
  | 'corridor';

export interface StationAreaDef {
  readonly id: StationAreaId;
  readonly name: string;
  readonly description: string;
  /** Room centre. */
  readonly center: Vec3;
  /** Half extents on X and Z; rooms are rectangular. */
  readonly halfExtents: Vec2;
  /** Floor height of the room. */
  readonly floorY: number;
  readonly ceilingHeight: number;
  readonly accentColor: string;
  readonly ambientColor: string;
  /** Level required to enter. `0` means always unlocked. */
  readonly requiredLevel: number;
  readonly icon: string;
}

export interface MiningZoneDef {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  /** Travel time one-way in seconds. */
  readonly travelSec: number;
  readonly distanceAu: number;
  /** Fuel burned per expedition, before ship efficiency. */
  readonly fuelCost: number;
  readonly requiredLevel: number;
  readonly hazard: number;
  /** Weighted resource table; weights need not sum to 1. */
  readonly table: readonly { readonly resource: ResourceId; readonly weight: number }[];
  /** Multiplier applied to extracted amounts. */
  readonly richness: number;
  /** Number of asteroids spawned in the field scene. */
  readonly asteroidCount: number;
  /** Field palette for rendering. */
  readonly palette: { readonly rock: string; readonly fog: string; readonly star: string };
  readonly requiredFaction?: { readonly faction: FactionId; readonly rank: number };
}

export interface AchievementDef {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly icon: string;
  readonly points: number;
  readonly hidden: boolean;
  readonly metric: AchievementMetric;
  readonly threshold: number;
}

export type AchievementMetric =
  | 'missions_completed'
  | 'resources_mined'
  | 'credits_earned'
  | 'items_crafted'
  | 'level'
  | 'expeditions'
  | 'trades'
  | 'distance_walked'
  | 'assets_owned';

export type InteractableKind =
  | 'mission_terminal'
  | 'hangar_console'
  | 'market_console'
  | 'craft_bench'
  | 'research_console'
  | 'refinery'
  | 'storage'
  | 'launch_console'
  | 'avatar_station'
  | 'leaderboard'
  | 'door'
  | 'lore';

export interface InteractableDef {
  readonly id: string;
  readonly kind: InteractableKind;
  readonly label: string;
  readonly prompt: string;
  readonly area: StationAreaId;
  readonly position: Vec3;
  /** Facing angle in radians around Y. */
  readonly rotationY: number;
  /** Interaction radius in metres. */
  readonly radius: number;
  readonly color: string;
  /** Optional payload, e.g. a lore string or a target area for doors. */
  readonly payload?: string;
}

/** Axis-aligned solid box. Blocks horizontal movement. */
export interface BoxCollider {
  readonly kind: 'box';
  readonly min: Vec3;
  readonly max: Vec3;
  /** Debug/renderer tag. */
  readonly tag: string;
}

/** Flat walkable surface. */
export interface FloorSurface {
  readonly kind: 'floor';
  readonly min: Vec2;
  readonly max: Vec2;
  readonly y: number;
  readonly area: StationAreaId;
  readonly tag: string;
}

/** Sloped walkable surface, linear along one axis. */
export interface RampSurface {
  readonly kind: 'ramp';
  readonly min: Vec2;
  readonly max: Vec2;
  readonly axis: 'x' | 'z';
  /** Height at the `min` end of `axis`. */
  readonly yStart: number;
  /** Height at the `max` end of `axis`. */
  readonly yEnd: number;
  readonly area: StationAreaId;
  readonly tag: string;
}

export type WalkSurface = FloorSurface | RampSurface;

/** A wall/prop rendered as a box. Renderer and physics consume the same list. */
export interface StationSolid extends BoxCollider {
  readonly color: string;
  readonly emissive?: string;
  readonly emissiveIntensity?: number;
  readonly metalness: number;
  readonly roughness: number;
  /** Group key used for instanced rendering. */
  readonly group: string;
}

export interface StationGeometry {
  readonly surfaces: readonly WalkSurface[];
  readonly solids: readonly StationSolid[];
  readonly bounds: { readonly min: Vec3; readonly max: Vec3 };
}
