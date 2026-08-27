import { COSMETICS_BY_ID, EQUIPMENT_BY_ID, MODULES_BY_ID } from '@nova/game-data';

/**
 * Mapping between on-chain ERC-1155 ids and game-data definition ids.
 *
 * These ids are consensus: `contracts/script/Deploy.s.sol` registers exactly
 * this list on the NovaItems contract, and `test/item-registry.test.ts` reads
 * that script back to prove the two never drift apart. Changing an id here
 * without changing the deploy script is a test failure, not a production bug.
 */
export interface OnChainItem {
  readonly tokenId: number;
  readonly kind: 'module' | 'equipment' | 'cosmetic';
  readonly defId: string;
}

export const ON_CHAIN_ITEMS: readonly OnChainItem[] = [
  { tokenId: 1, kind: 'module', defId: 'mining_laser_ii' },
  { tokenId: 2, kind: 'module', defId: 'harmonic_extractor' },
  { tokenId: 3, kind: 'module', defId: 'cargo_singularity' },
  { tokenId: 4, kind: 'module', defId: 'fusion_drive' },
  { tokenId: 5, kind: 'module', defId: 'aegis_shield' },
  { tokenId: 6, kind: 'module', defId: 'deep_scanner' },
  { tokenId: 7, kind: 'equipment', defId: 'suit_voidwalker' },
  { tokenId: 8, kind: 'equipment', defId: 'tool_refiner' },
  { tokenId: 9, kind: 'cosmetic', defId: 'pattern_circuit' },
  { tokenId: 10, kind: 'cosmetic', defId: 'trail_nova' },
  { tokenId: 11, kind: 'cosmetic', defId: 'accessory_wings' },
];

export const TOKEN_ID_BY_DEF: ReadonlyMap<string, number> = new Map(
  ON_CHAIN_ITEMS.map((item) => [item.defId, item.tokenId]),
);

export const ITEM_BY_TOKEN_ID: ReadonlyMap<number, OnChainItem> = new Map(
  ON_CHAIN_ITEMS.map((item) => [item.tokenId, item]),
);

/** True when a game item has an on-chain counterpart. */
export function isOnChainItem(defId: string): boolean {
  return TOKEN_ID_BY_DEF.has(defId);
}

/** Resolves the display name of an on-chain item id. */
export function onChainItemName(tokenId: number): string | null {
  const item = ITEM_BY_TOKEN_ID.get(tokenId);
  if (!item) return null;
  const def =
    item.kind === 'module'
      ? MODULES_BY_ID.get(item.defId)
      : item.kind === 'equipment'
        ? EQUIPMENT_BY_ID.get(item.defId)
        : COSMETICS_BY_ID.get(item.defId);
  return def?.name ?? null;
}

/** Ships that can exist as ERC-721 assets, keyed by their game-data id. */
export const ON_CHAIN_SHIP_DEFS: readonly string[] = ['aurora', 'harrow'];

export const ASSET_KIND = {
  ship: 'ship',
  collectible: 'collectible',
} as const;

export type AssetKind = (typeof ASSET_KIND)[keyof typeof ASSET_KIND];
