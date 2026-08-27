import {
  MINING_MINIGAME,
  MINING_ZONES_BY_ID,
  RESOURCES,
  ZONE_FUEL_BURN_PER_SEC,
  type MiningZoneDef,
  type ResourceId,
  type ShipStats,
} from '@nova/game-data';
import { clamp } from './math.js';
import { createRng, type Rng } from './rng.js';
import { cargoWeight } from './inventory.js';

export interface MiningAttempt {
  readonly zoneId: string;
  readonly shipStats: ShipStats;
  readonly laserTier: number;
  /** Wall-clock seconds the extraction ran, measured by the server. */
  readonly elapsedSec: number;
  /** Minigame ticks the client claims it held the resonance band. */
  readonly claimedHoldTicks: number;
  /** Cargo weight already in the hold. */
  readonly cargoUsed: number;
  /** Seed the server derived for this extraction. */
  readonly seed: number;
}

export interface MiningYield {
  readonly resource: ResourceId;
  readonly amount: number;
}

export interface MiningResult {
  readonly yields: readonly MiningYield[];
  /** Resonance multiplier actually applied, after clamping the client's claim. */
  readonly multiplier: number;
  /** Ticks the server accepted, which may be fewer than were claimed. */
  readonly acceptedHoldTicks: number;
  readonly maxPossibleTicks: number;
  /** True when the client claimed more ticks than the elapsed time allows. */
  readonly clamped: boolean;
  readonly fuelUsed: number;
  readonly cargoAdded: number;
  /** Cargo the hold could not take; discarded rather than silently granted. */
  readonly overflow: readonly MiningYield[];
  readonly rareRolled: boolean;
}

/**
 * Resolves one asteroid extraction, server-side.
 *
 * The client's only input is `claimedHoldTicks` — how well the player played the
 * resonance minigame. That claim is clamped to the number of ticks that could
 * physically have elapsed, and then it only scales a bounded multiplier between
 * `minMultiplier` and `maxMultiplier`. A client that reports a perfect score it
 * did not earn gains at most 45%; a client that reports an impossible score
 * gains nothing extra at all. Which resources drop, and how many, is decided
 * here from a server seed the client never sees.
 */
export function resolveMining(attempt: MiningAttempt, cargoCapacity: number): MiningResult {
  const zone = MINING_ZONES_BY_ID.get(attempt.zoneId);
  if (!zone) {
    return emptyResult();
  }

  const elapsed = clamp(attempt.elapsedSec, 0, MINING_MINIGAME.extractSec * 3);
  const maxPossibleTicks = Math.ceil(elapsed * MINING_MINIGAME.tickHz);
  const claimed = Number.isFinite(attempt.claimedHoldTicks)
    ? Math.max(0, Math.floor(attempt.claimedHoldTicks))
    : 0;
  const accepted = Math.min(claimed, maxPossibleTicks);
  const clamped = claimed > maxPossibleTicks;

  const accuracy = maxPossibleTicks > 0 ? accepted / maxPossibleTicks : 0;
  const multiplier =
    MINING_MINIGAME.minMultiplier +
    (MINING_MINIGAME.maxMultiplier - MINING_MINIGAME.minMultiplier) * clamp(accuracy, 0, 1);

  const rng = createRng(attempt.seed);
  const effectiveSeconds = Math.min(elapsed, MINING_MINIGAME.extractSec);

  // The base haul — and therefore which resources are drawn — depends only on
  // the ship and the zone. The resonance multiplier is applied afterwards, as a
  // pure scalar on the amounts, so playing the minigame well never changes
  // *what* comes out of the rock and the reward stays provably bounded by
  // `maxMultiplier / minMultiplier`.
  const baseUnits =
    attempt.shipStats.miningPower *
    MINING_MINIGAME.yieldPerPowerSec *
    effectiveSeconds *
    zone.richness;

  const draws = baseUnits > 24 ? 3 : 2;
  const perDraw = baseUnits / draws;
  const totals = new Map<ResourceId, number>();
  let rareRolled = false;

  for (let i = 0; i < draws; i += 1) {
    const picked = pickResource(rng, zone, attempt.laserTier, attempt.shipStats.sensors);
    if (!picked) continue;
    if (RESOURCES[picked].rarity === 'epic' || RESOURCES[picked].rarity === 'legendary') {
      rareRolled = true;
    }
    // Rarer materials come out in smaller quantities for the same beam time.
    const rarityDivisor = Math.max(1, RESOURCES[picked].baseValue / RESOURCES.iron.baseValue) ** 0.55;
    const amount = Math.max(
      1,
      Math.round((perDraw / rarityDivisor) * rng.range(0.85, 1.15) * multiplier),
    );
    totals.set(picked, (totals.get(picked) ?? 0) + amount);
  }

  // Fit the haul into the remaining hold, largest-value first so the player
  // keeps what matters when the hold is nearly full.
  const free = Math.max(0, cargoCapacity - attempt.cargoUsed);
  const sorted = [...totals.entries()]
    .map(([resource, amount]) => ({ resource, amount }))
    .sort((a, b) => RESOURCES[b.resource].baseValue - RESOURCES[a.resource].baseValue);

  const kept: MiningYield[] = [];
  const overflow: MiningYield[] = [];
  let used = 0;

  for (const entry of sorted) {
    const unitWeight = RESOURCES[entry.resource].weight;
    const room = Math.floor((free - used) / unitWeight);
    const take = Math.max(0, Math.min(entry.amount, room));
    if (take > 0) {
      kept.push({ resource: entry.resource, amount: take });
      used += take * unitWeight;
    }
    if (take < entry.amount) {
      overflow.push({ resource: entry.resource, amount: entry.amount - take });
    }
  }

  return {
    yields: kept,
    multiplier: Math.round(multiplier * 1000) / 1000,
    acceptedHoldTicks: accepted,
    maxPossibleTicks,
    clamped,
    fuelUsed: Math.round(elapsed * ZONE_FUEL_BURN_PER_SEC * 100) / 100,
    cargoAdded: Math.round(cargoWeight(kept) * 100) / 100,
    overflow,
    rareRolled,
  };
}

function pickResource(
  rng: Rng,
  zone: MiningZoneDef,
  laserTier: number,
  sensors: number,
): ResourceId | null {
  const sensorBonus = Math.min(
    MINING_MINIGAME.maxSensorRareBonus,
    sensors * MINING_MINIGAME.sensorRareBonusPerPoint,
  );
  const eligible = zone.table.filter((row) => RESOURCES[row.resource].minLaserTier <= laserTier);
  if (eligible.length === 0) return null;

  const picked = rng.pick(eligible, (row) => {
    const res = RESOURCES[row.resource];
    // Better sensors tilt the table towards the scarce end of the zone.
    const rareLean = res.rarity === 'common' ? 1 - sensorBonus : 1 + sensorBonus * 2;
    return row.weight * rareLean;
  });
  return picked ? picked.resource : null;
}

function emptyResult(): MiningResult {
  return {
    yields: [],
    multiplier: MINING_MINIGAME.minMultiplier,
    acceptedHoldTicks: 0,
    maxPossibleTicks: 0,
    clamped: false,
    fuelUsed: 0,
    cargoAdded: 0,
    overflow: [],
    rareRolled: false,
  };
}

export interface ExpeditionCost {
  readonly fuel: number;
  readonly travelSec: number;
}

/** Fuel and time to reach a zone, before in-field burn. */
export function expeditionCost(zoneId: string, stats: ShipStats): ExpeditionCost | null {
  const zone = MINING_ZONES_BY_ID.get(zoneId);
  if (!zone) return null;
  // Faster ships arrive sooner but burn slightly more getting there.
  const speedFactor = clamp(40 / Math.max(1, stats.speed), 0.45, 2.2);
  return {
    fuel: Math.round(zone.fuelCost * (0.7 + 0.3 / speedFactor) * 100) / 100,
    travelSec: Math.round(zone.travelSec * speedFactor),
  };
}

/**
 * Hazard roll for an expedition. A failed roll costs cargo, never the ship,
 * so a bad run is a setback rather than an account-ending event.
 */
export function rollHazard(
  zoneId: string,
  stats: ShipStats,
  seed: number,
): { readonly triggered: boolean; readonly cargoLossFraction: number } {
  const zone = MINING_ZONES_BY_ID.get(zoneId);
  if (!zone) return { triggered: false, cargoLossFraction: 0 };
  const rng = createRng(seed);
  const mitigated = zone.hazard * clamp(1 - stats.defense / 140, 0.15, 1);
  if (!rng.chance(mitigated)) return { triggered: false, cargoLossFraction: 0 };
  return {
    triggered: true,
    cargoLossFraction: Math.round(rng.range(0.08, 0.28) * 1000) / 1000,
  };
}
