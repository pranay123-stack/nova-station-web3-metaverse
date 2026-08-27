import { GameError } from '@nova/shared';
import { RESOURCES, type ResourceId } from '@nova/game-data';
import { bagFrom, cargoWeight, describeItem, type ItemKind, type ResourceBag } from '@nova/game-engine';
import type { Tx } from '../db/client.js';

export interface ItemChange {
  readonly kind: ItemKind;
  readonly defId: string;
  readonly amount: number;
}

/**
 * Inventory mutation.
 *
 * Every grant and every spend passes through `addItems` / `removeItems`, which
 * refuse to create an item that does not exist in the catalogues and refuse to
 * take one a player does not have. That second guarantee is enforced by a
 * conditional update rather than a read-then-write, so two concurrent requests
 * cannot both spend the same stack.
 */
export async function addItems(tx: Tx, userId: string, changes: readonly ItemChange[]): Promise<void> {
  for (const change of changes) {
    if (change.amount <= 0) continue;
    if (!describeItem({ kind: change.kind, id: change.defId })) {
      throw new GameError('validation_failed', `Unknown item: ${change.kind}:${change.defId}`);
    }
    await tx.inventoryItem.upsert({
      where: { userId_kind_defId: { userId, kind: change.kind, defId: change.defId } },
      create: { userId, kind: change.kind, defId: change.defId, amount: change.amount },
      update: { amount: { increment: change.amount } },
    });
  }
}

export async function removeItems(
  tx: Tx,
  userId: string,
  changes: readonly ItemChange[],
): Promise<void> {
  for (const change of changes) {
    if (change.amount <= 0) continue;
    const removed = await tx.inventoryItem.updateMany({
      where: {
        userId,
        kind: change.kind,
        defId: change.defId,
        amount: { gte: change.amount },
      },
      data: { amount: { decrement: change.amount } },
    });
    if (removed.count !== 1) {
      throw new GameError(
        'insufficient_resources',
        `Not enough ${change.defId} in your inventory.`,
        { kind: change.kind, defId: change.defId, needed: change.amount },
      );
    }
  }
  // Empty stacks are removed so the inventory does not fill with zero rows.
  await tx.inventoryItem.deleteMany({ where: { userId, amount: { lte: 0 }, equipped: false } });
}

export async function resourceBag(tx: Tx, userId: string): Promise<ResourceBag> {
  const rows = await tx.inventoryItem.findMany({
    where: { userId, kind: 'resource' },
    select: { defId: true, amount: true },
  });
  return bagFrom(
    rows
      .filter((row) => row.defId in RESOURCES)
      .map((row) => ({ resource: row.defId as ResourceId, amount: row.amount })),
  );
}

export async function countOf(
  tx: Tx,
  userId: string,
  kind: ItemKind,
  defId: string,
): Promise<number> {
  const row = await tx.inventoryItem.findUnique({
    where: { userId_kind_defId: { userId, kind, defId } },
    select: { amount: true },
  });
  return row?.amount ?? 0;
}

/** Total cargo weight of everything the player is carrying. */
export async function carriedWeight(tx: Tx, userId: string): Promise<number> {
  const bag = await resourceBag(tx, userId);
  return cargoWeight(
    (Object.entries(bag) as [ResourceId, number][]).map(([resource, amount]) => ({
      resource,
      amount,
    })),
  );
}

export async function setEquipped(
  tx: Tx,
  userId: string,
  kind: 'equipment' | 'cosmetic',
  defId: string,
  equipped: boolean,
): Promise<void> {
  const owned = await countOf(tx, userId, kind, defId);
  if (owned <= 0) {
    throw new GameError('not_owned', 'You do not own that item.');
  }
  await tx.inventoryItem.update({
    where: { userId_kind_defId: { userId, kind, defId } },
    data: { equipped },
  });
}

export interface EquippedItems {
  readonly equipment: readonly string[];
  readonly cosmetics: readonly string[];
}

export async function equippedItems(tx: Tx, userId: string): Promise<EquippedItems> {
  const rows = await tx.inventoryItem.findMany({
    where: { userId, equipped: true },
    select: { kind: true, defId: true },
  });
  return {
    equipment: rows.filter((r) => r.kind === 'equipment').map((r) => r.defId),
    cosmetics: rows.filter((r) => r.kind === 'cosmetic').map((r) => r.defId),
  };
}
