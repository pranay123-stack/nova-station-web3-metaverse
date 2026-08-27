import type { FactionId, MissionDef, Rarity, ResourceId, ShipStats } from '@nova/game-data';

/**
 * Response shapes returned by the API.
 *
 * These are the contract between server and client. The server builds them from
 * database rows; the client's stores consume them directly, so a change here is
 * a change both sides see at compile time.
 */

export interface PlayerDto {
  readonly address: string;
  readonly displayName: string;
  readonly level: number;
  readonly xp: number;
  readonly xpIntoLevel: number;
  readonly xpForLevel: number;
  readonly credits: number;
  readonly health: number;
  readonly energy: number;
  readonly energyMax: number;
  readonly playtimeSec: number;
  readonly createdAt: string;
  readonly lastSeenAt: string;
  readonly primaryFaction: FactionId | null;
  readonly reputation: Readonly<Record<FactionId, number>>;
  readonly ranks: Readonly<Record<FactionId, number>>;
  readonly rankNames: Readonly<Record<FactionId, string>>;
  readonly feeDiscount: number;
  readonly unlockedAreas: readonly string[];
  readonly stats: {
    readonly missionsCompleted: number;
    readonly resourcesMined: number;
    readonly creditsEarned: number;
    readonly itemsCrafted: number;
    readonly expeditions: number;
    readonly trades: number;
    readonly distanceWalked: number;
  };
}

export interface AvatarStateDto {
  readonly displayName: string;
  readonly suitId: string;
  readonly helmetId: string;
  readonly suitPattern: string;
  readonly visor: string;
  readonly emblem: string;
  readonly accessory: string;
  readonly primaryColor: string;
  readonly secondaryColor: string;
}

export interface ShipDto {
  readonly id: string;
  readonly defId: string;
  readonly name: string;
  readonly shipClass: string;
  readonly rarity: Rarity;
  readonly active: boolean;
  readonly fuel: number;
  readonly upgrades: Partial<Record<keyof ShipStats, number>>;
  readonly modules: readonly (string | null)[];
  readonly stats: ShipStats;
  readonly baseStats: ShipStats;
  readonly moduleSlots: number;
  readonly laserTier: number;
  /** Set when this hull is backed by an ERC-721 token. */
  readonly tokenId: string | null;
  readonly acquiredAt: string;
}

export interface InventoryEntryDto {
  readonly kind: 'resource' | 'module' | 'equipment' | 'cosmetic';
  readonly defId: string;
  readonly name: string;
  readonly rarity: Rarity;
  readonly amount: number;
  readonly equipped: boolean;
  readonly value: number;
  /** How many of this stack are represented by on-chain tokens. */
  readonly onChainAmount: number;
}

export interface InventoryDto {
  readonly credits: number;
  readonly cargoUsed: number;
  readonly cargoCapacity: number;
  readonly entries: readonly InventoryEntryDto[];
}

export interface MissionOfferDto {
  readonly mission: MissionDef;
  readonly available: boolean;
  readonly reason: string | null;
  readonly cooldownRemainingSec: number;
}

export interface ActiveMissionDto {
  readonly id: string;
  readonly missionId: string;
  readonly progress: readonly number[];
  readonly targets: readonly number[];
  readonly complete: boolean;
  readonly acceptedAt: string;
  readonly expiresAt: string;
  readonly secondsRemaining: number;
}

export interface ExpeditionDto {
  readonly id: string;
  readonly zoneId: string;
  readonly shipId: string;
  readonly status: 'travelling' | 'active' | 'returning' | 'complete' | 'aborted';
  readonly startedAt: string;
  readonly arrivesAt: string;
  readonly fuelRemaining: number;
  readonly cargoUsed: number;
  readonly cargoCapacity: number;
  readonly minedNodes: readonly number[];
  readonly scannedNodes: readonly number[];
  readonly haul: readonly { readonly resource: ResourceId; readonly amount: number }[];
  /** Deterministic seed for the client's asteroid field layout. */
  readonly fieldSeed: number;
}

export interface ExtractResultDto {
  readonly yields: readonly { readonly resource: ResourceId; readonly amount: number }[];
  readonly multiplier: number;
  readonly overflow: readonly { readonly resource: ResourceId; readonly amount: number }[];
  readonly cargoUsed: number;
  readonly cargoCapacity: number;
  readonly fuelRemaining: number;
  readonly rare: boolean;
}

export interface CraftDto {
  readonly id: string;
  readonly recipeId: string;
  readonly startedAt: string;
  readonly readyAt: string;
  readonly secondsRemaining: number;
  readonly collected: boolean;
}

export interface ListingDto {
  readonly id: string;
  readonly kind: 'resource' | 'module' | 'equipment' | 'cosmetic' | 'ship' | 'collectible';
  readonly defId: string;
  readonly name: string;
  readonly rarity: Rarity;
  readonly amount: number;
  readonly price: string;
  readonly currency: 'credits' | 'eth';
  readonly seller: string;
  readonly sellerName: string;
  readonly createdAt: string;
  readonly onChain: boolean;
  /** Present for on-chain listings. */
  readonly chain: {
    readonly listingId: string;
    readonly collection: string;
    readonly tokenId: string;
    readonly standard: 'erc721' | 'erc1155';
  } | null;
}

export interface BlockchainAssetDto {
  readonly id: string;
  readonly collection: string;
  readonly standard: 'erc721' | 'erc1155';
  readonly tokenId: string;
  readonly amount: string;
  readonly kind: string;
  readonly defId: string;
  readonly name: string;
  readonly rarity: Rarity;
  readonly owner: string;
  readonly imageSeed: number;
  readonly lastSyncedBlock: string;
  /** True while the indexer has not yet caught up with a pending transfer. */
  readonly pending: boolean;
}

export interface LeaderboardRowDto {
  readonly rank: number;
  readonly address: string;
  readonly displayName: string;
  readonly level: number;
  readonly value: number;
  readonly faction: FactionId | null;
}

export interface AchievementDto {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly icon: string;
  readonly points: number;
  readonly unlocked: boolean;
  readonly unlockedAt: string | null;
  readonly progress: number;
  readonly threshold: number;
}

export interface SessionDto {
  readonly address: string;
  readonly issuedAt: string;
  readonly expiresAt: string;
  readonly chainId: number;
}
