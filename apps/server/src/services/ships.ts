import {
  MODULES_BY_ID,
  SHIPS_BY_ID,
  SHIP_STAT_KEYS,
  type ShipStats,
} from '@nova/game-data';
import { canUpgrade, computeShipStats, upgradeCost, type UpgradeMap } from '@nova/game-engine';
import { GameError, type ShipDto } from '@nova/shared';
import { TOKEN_ID_BY_DEF } from '@nova/shared';
import type { Db, Tx } from '../db/client.js';
import { moveCredits } from './ledger.js';
import { addItems, removeItems } from './inventory.js';
import { rankFor } from '@nova/game-engine';
import { readStanding } from './progression.js';

interface ShipRow {
  id: string;
  defId: string;
  name: string;
  active: boolean;
  fuel: number;
  tokenId: string | null;
  acquiredAt: Date;
  upgrades: { stat: string; tier: number }[];
  modules: { slotIndex: number; moduleDefId: string }[];
}

function toUpgradeMap(rows: readonly { stat: string; tier: number }[]): UpgradeMap {
  const map: UpgradeMap = {};
  for (const row of rows) {
    if ((SHIP_STAT_KEYS as readonly string[]).includes(row.stat)) {
      map[row.stat as keyof ShipStats] = row.tier;
    }
  }
  return map;
}

export function shipDto(row: ShipRow): ShipDto {
  const def = SHIPS_BY_ID.get(row.defId);
  if (!def) throw new GameError('internal_error', `Unknown ship definition ${row.defId}`);

  const slots = def.moduleSlots + 3;
  const moduleSlots: (string | null)[] = Array.from({ length: slots }, () => null);
  for (const module of row.modules) {
    if (module.slotIndex >= 0 && module.slotIndex < slots) {
      moduleSlots[module.slotIndex] = module.moduleDefId;
    }
  }

  const upgrades = toUpgradeMap(row.upgrades);
  const effective = computeShipStats({
    defId: row.defId,
    upgrades,
    moduleIds: moduleSlots.filter((id): id is string => id !== null),
  });

  return {
    id: row.id,
    defId: row.defId,
    name: row.name,
    shipClass: def.shipClass,
    rarity: def.rarity,
    active: row.active,
    fuel: Math.round(row.fuel * 100) / 100,
    upgrades,
    modules: moduleSlots.slice(0, effective.moduleSlots),
    stats: effective.stats,
    baseStats: def.baseStats,
    moduleSlots: effective.moduleSlots,
    laserTier: effective.laserTier,
    tokenId: row.tokenId,
    acquiredAt: row.acquiredAt.toISOString(),
  };
}

const SHIP_SELECT = {
  id: true,
  defId: true,
  name: true,
  active: true,
  fuel: true,
  tokenId: true,
  acquiredAt: true,
  upgrades: { select: { stat: true, tier: true } },
  modules: { select: { slotIndex: true, moduleDefId: true } },
} as const;

export async function listShips(db: Db, userId: string): Promise<ShipDto[]> {
  const rows = await db.ship.findMany({
    where: { userId },
    select: SHIP_SELECT,
    orderBy: [{ active: 'desc' }, { acquiredAt: 'asc' }],
  });
  return rows.map(shipDto);
}

export async function getShip(tx: Tx, userId: string, shipId: string): Promise<ShipDto> {
  const row = await tx.ship.findFirst({ where: { id: shipId, userId }, select: SHIP_SELECT });
  if (!row) throw new GameError('not_found', 'Ship not found.');
  return shipDto(row);
}

export async function activeShip(tx: Tx, userId: string): Promise<ShipDto | null> {
  const row = await tx.ship.findFirst({ where: { userId, active: true }, select: SHIP_SELECT });
  return row ? shipDto(row) : null;
}

export async function selectShip(db: Db, userId: string, shipId: string): Promise<ShipDto> {
  return db.$transaction(async (tx) => {
    const owned = await tx.ship.findFirst({ where: { id: shipId, userId }, select: { id: true } });
    if (!owned) throw new GameError('not_found', 'Ship not found.');

    const flying = await tx.expedition.findFirst({
      where: { userId, status: { in: ['travelling', 'active', 'returning'] } },
      select: { id: true },
    });
    if (flying) {
      throw new GameError('busy', 'You cannot change ships during an expedition.');
    }

    await tx.ship.updateMany({ where: { userId }, data: { active: false } });
    await tx.ship.update({ where: { id: shipId }, data: { active: true } });
    return getShip(tx, userId, shipId);
  });
}

export async function renameShip(db: Db, userId: string, shipId: string, name: string): Promise<ShipDto> {
  const updated = await db.ship.updateMany({ where: { id: shipId, userId }, data: { name } });
  if (updated.count !== 1) throw new GameError('not_found', 'Ship not found.');
  return getShip(db, userId, shipId);
}

/** Buys a hull from the hangar catalogue with credits. */
export async function buyShip(db: Db, userId: string, defId: string): Promise<ShipDto> {
  const def = SHIPS_BY_ID.get(defId);
  if (!def) throw new GameError('not_found', 'No such ship.');
  const price = def.creditPrice;
  if (price === null) {
    throw new GameError('forbidden', 'That hull is not sold for credits.');
  }

  return db.$transaction(async (tx) => {
    const user = await tx.user.findUniqueOrThrow({
      where: { id: userId },
      select: { level: true },
    });
    if (user.level < def.requiredLevel) {
      throw new GameError('insufficient_level', `Requires level ${def.requiredLevel}.`);
    }
    if (def.requiredFaction) {
      const standing = await readStanding(tx, userId);
      const rank = rankFor(def.requiredFaction.faction, standing[def.requiredFaction.faction]);
      if (rank < def.requiredFaction.rank) {
        throw new GameError('insufficient_reputation', 'Your standing is too low for that hull.');
      }
    }

    if (price > 0) {
      await moveCredits(tx, {
        userId,
        kind: 'ship',
        delta: -BigInt(price),
        reason: `Purchased ${def.name}`,
      });
    }

    const ship = await tx.ship.create({
      data: {
        userId,
        defId: def.id,
        name: def.name,
        active: false,
        fuel: def.baseStats.fuel,
      },
      select: SHIP_SELECT,
    });
    return shipDto(ship);
  });
}

export interface UpgradeResult {
  readonly ship: ShipDto;
  readonly spentCredits: number;
  readonly newTier: number;
}

export async function upgradeShip(
  db: Db,
  userId: string,
  shipId: string,
  stat: keyof ShipStats,
): Promise<UpgradeResult> {
  return db.$transaction(async (tx) => {
    const ship = await tx.ship.findFirst({
      where: { id: shipId, userId },
      select: { id: true, defId: true, upgrades: { select: { stat: true, tier: true } } },
    });
    if (!ship) throw new GameError('not_found', 'Ship not found.');

    const current = ship.upgrades.find((u) => u.stat === stat)?.tier ?? 0;
    if (!canUpgrade(current)) {
      throw new GameError('conflict', 'That system is already at maximum tier.');
    }

    const cost = upgradeCost(current, stat);
    await removeItems(
      tx,
      userId,
      cost.resources.map((r) => ({ kind: 'resource' as const, defId: r.resource, amount: r.amount })),
    );
    await moveCredits(tx, {
      userId,
      kind: 'upgrade',
      delta: -BigInt(cost.credits),
      reason: `Upgraded ${stat} to tier ${current + 1}`,
      refId: shipId,
    });

    await tx.shipUpgrade.upsert({
      where: { shipId_stat: { shipId, stat } },
      create: { shipId, stat, tier: current + 1 },
      update: { tier: current + 1 },
    });

    return {
      ship: await getShip(tx, userId, shipId),
      spentCredits: cost.credits,
      newTier: current + 1,
    };
  });
}

export async function equipModule(
  db: Db,
  userId: string,
  shipId: string,
  moduleId: string,
  slotIndex: number,
): Promise<ShipDto> {
  const def = MODULES_BY_ID.get(moduleId);
  if (!def) throw new GameError('not_found', 'No such module.');

  return db.$transaction(async (tx) => {
    const ship = await getShip(tx, userId, shipId);
    if (slotIndex >= ship.moduleSlots) {
      throw new GameError('validation_failed', 'That slot does not exist on this hull.');
    }

    // Taking the module out of the inventory and putting it in the slot is one
    // atomic move, so a module can never exist in both places at once.
    await removeItems(tx, userId, [{ kind: 'module', defId: moduleId, amount: 1 }]);

    const occupant = await tx.shipModule.findUnique({
      where: { shipId_slotIndex: { shipId, slotIndex } },
      select: { moduleDefId: true },
    });
    if (occupant) {
      await addItems(tx, userId, [{ kind: 'module', defId: occupant.moduleDefId, amount: 1 }]);
    }

    await tx.shipModule.upsert({
      where: { shipId_slotIndex: { shipId, slotIndex } },
      create: { shipId, slotIndex, moduleDefId: moduleId },
      update: { moduleDefId: moduleId },
    });

    return getShip(tx, userId, shipId);
  });
}

export async function unequipModule(
  db: Db,
  userId: string,
  shipId: string,
  slotIndex: number,
): Promise<ShipDto> {
  return db.$transaction(async (tx) => {
    await getShip(tx, userId, shipId);
    const occupant = await tx.shipModule.findUnique({
      where: { shipId_slotIndex: { shipId, slotIndex } },
      select: { moduleDefId: true },
    });
    if (!occupant) throw new GameError('not_found', 'That slot is empty.');

    await tx.shipModule.delete({ where: { shipId_slotIndex: { shipId, slotIndex } } });
    await addItems(tx, userId, [{ kind: 'module', defId: occupant.moduleDefId, amount: 1 }]);
    return getShip(tx, userId, shipId);
  });
}

/** Buys fuel at the docking bay. */
export async function refuel(
  db: Db,
  userId: string,
  shipId: string,
  amount: number,
): Promise<{ ship: ShipDto; spent: number }> {
  return db.$transaction(async (tx) => {
    const ship = await getShip(tx, userId, shipId);
    const room = Math.max(0, ship.stats.fuel - ship.fuel);
    const filled = Math.min(amount, Math.ceil(room));
    if (filled <= 0) throw new GameError('conflict', 'That tank is already full.');

    const cost = filled * 3;
    await moveCredits(tx, {
      userId,
      kind: 'fuel',
      delta: -BigInt(cost),
      reason: `Refuelled ${ship.name}`,
      refId: shipId,
    });
    await tx.ship.update({
      where: { id: shipId },
      data: { fuel: Math.min(ship.stats.fuel, ship.fuel + filled) },
    });
    return { ship: await getShip(tx, userId, shipId), spent: cost };
  });
}

/** True when a hull is one that can exist as an ERC-721 token. */
export function isTokenisedShip(defId: string): boolean {
  return TOKEN_ID_BY_DEF.has(defId) === false && SHIPS_BY_ID.get(defId)?.creditPrice === null;
}
