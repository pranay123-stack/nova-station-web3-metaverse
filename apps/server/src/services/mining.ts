import {
  MINING_MINIGAME,
  MINING_ZONES_BY_ID,
  RESOURCES,
  type ResourceId,
} from '@nova/game-data';
import {
  cargoWeight,
  deriveSeed,
  expeditionCost,
  rankFor,
  resolveMining,
  resolveRefine,
  rollHazard,
} from '@nova/game-engine';
import { GameError, type ExpeditionDto, type ExtractResultDto } from '@nova/shared';
import type { Db } from '../db/client.js';
import { bigIntToSeed, secureSeed, seedToBigInt } from '../lib/ids.js';
import { addItems, removeItems } from './inventory.js';
import { moveCredits } from './ledger.js';
import { events, recordEvent } from './events.js';
import { awardXp, readStanding } from './progression.js';
import { getShip } from './ships.js';
import { personalStats } from './player.js';

interface HaulEntry {
  resource: ResourceId;
  amount: number;
}

function parseHaul(value: unknown): HaulEntry[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (entry): entry is HaulEntry =>
      typeof entry === 'object' &&
      entry !== null &&
      typeof (entry as HaulEntry).resource === 'string' &&
      (entry as HaulEntry).resource in RESOURCES &&
      Number.isFinite((entry as HaulEntry).amount),
  );
}

function mergeHaul(haul: HaulEntry[], additions: readonly HaulEntry[]): HaulEntry[] {
  const merged = new Map<ResourceId, number>();
  for (const entry of [...haul, ...additions]) {
    merged.set(entry.resource, (merged.get(entry.resource) ?? 0) + entry.amount);
  }
  return [...merged.entries()].map(([resource, amount]) => ({ resource, amount }));
}

const EXPEDITION_SELECT = {
  id: true,
  userId: true,
  shipId: true,
  zoneId: true,
  status: true,
  startedAt: true,
  arrivesAt: true,
  fuelAtStart: true,
  fuelUsed: true,
  cargoUsed: true,
  fieldSeed: true,
  rollSeed: true,
  rollCounter: true,
  minedNodes: true,
  scannedNodes: true,
  haul: true,
} as const;

type ExpeditionRow = {
  id: string;
  shipId: string;
  zoneId: string;
  status: string;
  startedAt: Date;
  arrivesAt: Date;
  fuelAtStart: number;
  fuelUsed: number;
  cargoUsed: number;
  fieldSeed: number;
  minedNodes: number[];
  scannedNodes: number[];
  haul: unknown;
};

function expeditionDto(row: ExpeditionRow, cargoCapacity: number): ExpeditionDto {
  return {
    id: row.id,
    zoneId: row.zoneId,
    shipId: row.shipId,
    status: row.status as ExpeditionDto['status'],
    startedAt: row.startedAt.toISOString(),
    arrivesAt: row.arrivesAt.toISOString(),
    fuelRemaining: Math.max(0, Math.round((row.fuelAtStart - row.fuelUsed) * 100) / 100),
    cargoUsed: Math.round(row.cargoUsed * 100) / 100,
    cargoCapacity,
    minedNodes: row.minedNodes,
    scannedNodes: row.scannedNodes,
    haul: parseHaul(row.haul),
    fieldSeed: row.fieldSeed >>> 0,
  };
}

/**
 * Launches an expedition.
 *
 * Fuel is deducted up front and the hull is locked for the duration, so the
 * cost of a trip is paid whether or not the player comes home with anything.
 * The roll seed generated here never leaves the server: it is what makes each
 * asteroid's contents unknowable in advance and unforgeable afterwards.
 */
export async function startExpedition(
  db: Db,
  userId: string,
  zoneId: string,
  shipId: string,
): Promise<ExpeditionDto> {
  const zone = MINING_ZONES_BY_ID.get(zoneId);
  if (!zone) throw new GameError('not_found', 'No such mining zone.');

  return db.$transaction(async (tx) => {
    const existing = await tx.expedition.findFirst({
      where: { userId, status: { in: ['travelling', 'active', 'returning'] } },
      select: { id: true },
    });
    if (existing) throw new GameError('busy', 'You already have an expedition in progress.');

    const user = await tx.user.findUniqueOrThrow({
      where: { id: userId },
      select: { level: true },
    });
    if (user.level < zone.requiredLevel) {
      throw new GameError('insufficient_level', `${zone.name} requires level ${zone.requiredLevel}.`);
    }
    if (zone.requiredFaction) {
      const standing = await readStanding(tx, userId);
      const rank = rankFor(zone.requiredFaction.faction, standing[zone.requiredFaction.faction]);
      if (rank < zone.requiredFaction.rank) {
        throw new GameError('insufficient_reputation', `${zone.name} is closed to you.`);
      }
    }

    const ship = await getShip(tx, userId, shipId);
    const cost = expeditionCost(zoneId, ship.stats);
    if (!cost) throw new GameError('not_found', 'No such mining zone.');
    if (ship.fuel < cost.fuel) {
      throw new GameError('insufficient_fuel', 'Not enough fuel for that trip.', {
        required: cost.fuel,
        available: ship.fuel,
      });
    }

    await tx.ship.update({
      where: { id: shipId },
      data: { fuel: { decrement: cost.fuel } },
    });

    const startedAt = new Date();
    const row = await tx.expedition.create({
      data: {
        userId,
        shipId,
        zoneId,
        status: 'travelling',
        startedAt,
        arrivesAt: new Date(startedAt.getTime() + cost.travelSec * 1000),
        fuelAtStart: ship.fuel - cost.fuel,
        fieldSeed: secureSeed(),
        rollSeed: seedToBigInt(secureSeed()),
        minedNodes: [],
        scannedNodes: [],
        haul: [],
      },
      select: EXPEDITION_SELECT,
    });

    await recordEvent(tx, userId, events.expedition(zoneId));
    return expeditionDto(row, ship.stats.cargo);
  });
}

/** Reads the live expedition, promoting it from travelling to active on arrival. */
export async function currentExpedition(db: Db, userId: string): Promise<ExpeditionDto | null> {
  const row = await db.expedition.findFirst({
    where: { userId, status: { in: ['travelling', 'active', 'returning'] } },
    select: EXPEDITION_SELECT,
  });
  if (!row) return null;

  let status = row.status;
  if (status === 'travelling' && row.arrivesAt.getTime() <= Date.now()) {
    await db.expedition.update({ where: { id: row.id }, data: { status: 'active' } });
    status = 'active';
  }

  const ship = await getShip(db, userId, row.shipId);
  return expeditionDto({ ...row, status }, ship.stats.cargo);
}

/**
 * Mines one asteroid.
 *
 * Three things make this safe to expose to a client:
 *
 *  - each node index may be mined once per expedition, enforced by the
 *    `minedNodes` array, so replaying the request yields nothing;
 *  - the elapsed time is measured by the server, not reported by the client;
 *  - the client's only input, `holdTicks`, is clamped to what that elapsed time
 *    allows and then only scales a bounded multiplier.
 */
export async function extract(
  db: Db,
  userId: string,
  expeditionId: string,
  nodeIndex: number,
  holdTicks: number,
): Promise<ExtractResultDto> {
  return db.$transaction(async (tx) => {
    const row = await tx.expedition.findFirst({
      where: { id: expeditionId, userId },
      select: EXPEDITION_SELECT,
    });
    if (!row) throw new GameError('not_found', 'No such expedition.');
    if (row.status === 'travelling' && row.arrivesAt.getTime() > Date.now()) {
      throw new GameError('invalid_state', 'You have not arrived yet.');
    }
    if (row.status === 'complete' || row.status === 'aborted' || row.status === 'returning') {
      throw new GameError('invalid_state', 'That expedition is over.');
    }
    if (row.minedNodes.includes(nodeIndex)) {
      throw new GameError('conflict', 'That asteroid has already been worked.');
    }

    const zone = MINING_ZONES_BY_ID.get(row.zoneId);
    if (!zone) throw new GameError('internal_error', 'Zone definition is missing.');

    const ship = await getShip(tx, userId, row.shipId);
    const fuelRemaining = row.fuelAtStart - row.fuelUsed;
    if (fuelRemaining <= 0) {
      throw new GameError('insufficient_fuel', 'Out of fuel. Return to the station.');
    }

    const result = resolveMining(
      {
        zoneId: row.zoneId,
        shipStats: ship.stats,
        laserTier: ship.laserTier,
        // The server sets the extraction window; a client cannot claim it ran longer.
        elapsedSec: MINING_MINIGAME.extractSec,
        claimedHoldTicks: holdTicks,
        cargoUsed: row.cargoUsed,
        seed: deriveSeed(bigIntToSeed(row.rollSeed), row.rollCounter),
      },
      ship.stats.cargo,
    );

    const haul = mergeHaul(parseHaul(row.haul), result.yields);
    const cargoUsed = cargoWeight(haul);

    await tx.expedition.update({
      where: { id: row.id },
      data: {
        status: 'active',
        minedNodes: { push: nodeIndex },
        rollCounter: { increment: 1 },
        fuelUsed: { increment: result.fuelUsed },
        cargoUsed,
        // Prisma's Json input type wants a plain JSON value, not a typed array.
        haul: haul as unknown as object[],
      },
    });

    return {
      yields: result.yields,
      multiplier: result.multiplier,
      overflow: result.overflow,
      cargoUsed: Math.round(cargoUsed * 100) / 100,
      cargoCapacity: ship.stats.cargo,
      fuelRemaining: Math.max(0, Math.round((fuelRemaining - result.fuelUsed) * 100) / 100),
      rare: result.rareRolled,
    };
  });
}

/** Logs a survey scan. Scans yield no ore, only mission progress. */
export async function scanNode(
  db: Db,
  userId: string,
  expeditionId: string,
  nodeIndex: number,
): Promise<{ scanned: number }> {
  return db.$transaction(async (tx) => {
    const row = await tx.expedition.findFirst({
      where: { id: expeditionId, userId },
      select: { id: true, zoneId: true, status: true, scannedNodes: true, arrivesAt: true },
    });
    if (!row) throw new GameError('not_found', 'No such expedition.');
    if (row.status !== 'active' && row.arrivesAt.getTime() > Date.now()) {
      throw new GameError('invalid_state', 'You have not arrived yet.');
    }
    if (row.scannedNodes.includes(nodeIndex)) {
      throw new GameError('conflict', 'That rock is already logged.');
    }

    await tx.expedition.update({
      where: { id: row.id },
      data: { status: 'active', scannedNodes: { push: nodeIndex } },
    });
    await recordEvent(tx, userId, events.scanned(row.zoneId, 1));
    return { scanned: row.scannedNodes.length + 1 };
  });
}

export interface ReturnResult {
  readonly haul: readonly HaulEntry[];
  readonly lost: readonly HaulEntry[];
  readonly hazard: boolean;
  readonly xp: number;
  readonly newLevel: number;
}

/**
 * Ends an expedition and moves the haul into the player's inventory.
 *
 * This is the only point at which mined ore becomes real. Everything before it
 * lives on the expedition row, which means a disconnect mid-run loses the trip
 * rather than duplicating it.
 */
export async function returnExpedition(
  db: Db,
  userId: string,
  expeditionId: string,
): Promise<ReturnResult> {
  return db.$transaction(async (tx) => {
    const row = await tx.expedition.findFirst({
      where: { id: expeditionId, userId },
      select: EXPEDITION_SELECT,
    });
    if (!row) throw new GameError('not_found', 'No such expedition.');
    if (row.status === 'complete' || row.status === 'aborted') {
      throw new GameError('conflict', 'That expedition is already settled.');
    }

    const closed = await tx.expedition.updateMany({
      where: { id: row.id, status: { in: ['travelling', 'active', 'returning'] } },
      data: { status: 'complete', endedAt: new Date() },
    });
    if (closed.count !== 1) {
      throw new GameError('conflict', 'That expedition is already settled.');
    }

    const ship = await getShip(tx, userId, row.shipId);
    const hazard = rollHazard(
      row.zoneId,
      ship.stats,
      deriveSeed(bigIntToSeed(row.rollSeed), 0xffff),
    );

    const haul = parseHaul(row.haul);
    const kept: HaulEntry[] = [];
    const lost: HaulEntry[] = [];

    for (const entry of haul) {
      const lostAmount = hazard.triggered
        ? Math.floor(entry.amount * hazard.cargoLossFraction)
        : 0;
      const keptAmount = entry.amount - lostAmount;
      if (keptAmount > 0) kept.push({ resource: entry.resource, amount: keptAmount });
      if (lostAmount > 0) lost.push({ resource: entry.resource, amount: lostAmount });
    }

    if (kept.length > 0) {
      await addItems(
        tx,
        userId,
        kept.map((entry) => ({ kind: 'resource' as const, defId: entry.resource, amount: entry.amount })),
      );
      for (const entry of kept) {
        await recordEvent(tx, userId, events.mined(entry.resource, entry.amount));
      }
    }

    await tx.ship.update({
      where: { id: row.shipId },
      data: { fuel: Math.max(0, row.fuelAtStart - row.fuelUsed) },
    });

    const xp = kept.reduce(
      (sum, entry) => sum + Math.round(RESOURCES[entry.resource].baseValue * entry.amount * 0.05),
      0,
    );
    const progression = await awardXp(tx, userId, xp);

    return { haul: kept, lost, hazard: hazard.triggered, xp, newLevel: progression.level };
  });
}

export interface RefineResult {
  readonly credits: number;
  readonly xp: number;
  readonly unitsProcessed: number;
  readonly newLevel: number;
}

/** Turns raw ore into credits at the Mining Bay. */
export async function refine(
  db: Db,
  userId: string,
  batch: readonly { resource: ResourceId; amount: number }[],
): Promise<RefineResult> {
  return db.$transaction(async (tx) => {
    await removeItems(
      tx,
      userId,
      batch.map((entry) => ({ kind: 'resource' as const, defId: entry.resource, amount: entry.amount })),
    );

    const stats = await personalStats(tx, userId);
    const result = resolveRefine(batch, stats.refineYield);

    await moveCredits(tx, {
      userId,
      kind: 'refine',
      delta: BigInt(result.credits),
      reason: `Refined ${result.unitsProcessed} units of ore`,
    });
    await recordEvent(tx, userId, events.refined(result.unitsProcessed));
    const progression = await awardXp(tx, userId, result.xp);

    return {
      credits: result.credits,
      xp: result.xp,
      unitsProcessed: result.unitsProcessed,
      newLevel: progression.level,
    };
  });
}

export { expeditionCost };
