import {
  COSMETICS_BY_ID,
  EQUIPMENT_BY_ID,
  MODULES_BY_ID,
  RESOURCES,
  isResourceId,
  type Rarity,
  type ResourceId,
} from '@nova/game-data';

export type ItemKind = 'resource' | 'module' | 'equipment' | 'cosmetic';

export interface ItemRef {
  readonly kind: ItemKind;
  readonly id: string;
}

export interface ItemStack extends ItemRef {
  readonly amount: number;
}

export interface ItemInfo {
  readonly kind: ItemKind;
  readonly id: string;
  readonly name: string;
  readonly rarity: Rarity;
  readonly stackable: boolean;
  readonly baseValue: number;
  readonly weight: number;
}

/** Resolves any item reference to its display and pricing metadata. */
export function describeItem(ref: ItemRef): ItemInfo | null {
  switch (ref.kind) {
    case 'resource': {
      if (!isResourceId(ref.id)) return null;
      const res = RESOURCES[ref.id as ResourceId];
      return {
        kind: 'resource',
        id: res.id,
        name: res.name,
        rarity: res.rarity,
        stackable: true,
        baseValue: res.baseValue,
        weight: res.weight,
      };
    }
    case 'module': {
      const mod = MODULES_BY_ID.get(ref.id);
      if (!mod) return null;
      return {
        kind: 'module',
        id: mod.id,
        name: mod.name,
        rarity: mod.rarity,
        stackable: true,
        baseValue: mod.creditPrice ?? 0,
        weight: 4,
      };
    }
    case 'equipment': {
      const eq = EQUIPMENT_BY_ID.get(ref.id);
      if (!eq) return null;
      return {
        kind: 'equipment',
        id: eq.id,
        name: eq.name,
        rarity: eq.rarity,
        stackable: true,
        baseValue: eq.creditPrice ?? 0,
        weight: 2,
      };
    }
    case 'cosmetic': {
      const cos = COSMETICS_BY_ID.get(ref.id);
      if (!cos) return null;
      return {
        kind: 'cosmetic',
        id: cos.id,
        name: cos.name,
        rarity: cos.rarity,
        stackable: false,
        baseValue: cos.creditPrice ?? 0,
        weight: 0,
      };
    }
    default:
      return null;
  }
}

export function itemExists(ref: ItemRef): boolean {
  return describeItem(ref) !== null;
}

/** Total cargo weight of a set of resource stacks. */
export function cargoWeight(stacks: readonly { resource: ResourceId; amount: number }[]): number {
  let total = 0;
  for (const stack of stacks) {
    total += RESOURCES[stack.resource].weight * stack.amount;
  }
  return Math.round(total * 100) / 100;
}

export type ResourceBag = Partial<Record<ResourceId, number>>;

export function bagFrom(
  stacks: readonly { resource: ResourceId; amount: number }[],
): ResourceBag {
  const bag: ResourceBag = {};
  for (const stack of stacks) {
    bag[stack.resource] = (bag[stack.resource] ?? 0) + stack.amount;
  }
  return bag;
}

export interface AffordabilityResult {
  readonly ok: boolean;
  readonly missing: readonly { readonly resource: ResourceId; readonly amount: number }[];
}

/** Checks a resource bag against a cost, reporting exactly what is short. */
export function canAfford(
  have: ResourceBag,
  cost: readonly { readonly resource: ResourceId; readonly amount: number }[],
): AffordabilityResult {
  const missing: { resource: ResourceId; amount: number }[] = [];
  for (const need of cost) {
    const owned = have[need.resource] ?? 0;
    if (owned < need.amount) {
      missing.push({ resource: need.resource, amount: need.amount - owned });
    }
  }
  return { ok: missing.length === 0, missing };
}
