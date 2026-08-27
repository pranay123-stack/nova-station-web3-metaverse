import {
  ECONOMY,
  FEE_SPLIT,
  REFINERY,
  RESOURCES,
  STATION_SPREAD,
  type ResourceId,
} from '@nova/game-data';
import { clamp } from './math.js';

export interface FeeBreakdown {
  readonly gross: number;
  readonly feeBps: number;
  readonly fee: number;
  readonly net: number;
  readonly treasuryCut: number;
  readonly vaultCut: number;
}

/**
 * Marketplace fee maths, shared by the off-chain ledger and the on-chain
 * marketplace contract. The contract enforces the same basis-point arithmetic,
 * so the number a player is quoted is the number the chain charges.
 */
export function computeFee(gross: number, discountFraction: number): FeeBreakdown {
  const price = Math.max(0, Math.floor(gross));
  const discounted = Math.round(ECONOMY.marketFeeBps * (1 - clamp(discountFraction, 0, 0.9)));
  const feeBps = Math.max(ECONOMY.minMarketFeeBps, discounted);
  const fee = Math.floor((price * feeBps) / 10_000);
  const treasuryCut = Math.floor((fee * FEE_SPLIT.treasuryBps) / 10_000);
  return {
    gross: price,
    feeBps,
    fee,
    net: price - fee,
    treasuryCut,
    vaultCut: fee - treasuryCut,
  };
}

/** Credits the station broker pays for raw ore. */
export function stationBuyPrice(resource: ResourceId, amount: number): number {
  return Math.floor(RESOURCES[resource].baseValue * STATION_SPREAD.buyFromPlayer * amount);
}

/** Credits the station broker charges to sell raw ore. */
export function stationSellPrice(resource: ResourceId, amount: number): number {
  return Math.ceil(RESOURCES[resource].baseValue * STATION_SPREAD.sellToPlayer * amount);
}

export interface RefineResult {
  readonly credits: number;
  readonly xp: number;
  readonly durationSec: number;
  readonly unitsProcessed: number;
}

/**
 * Refining raw ore into credits — the game's primary credit faucet, and the
 * reason to fly home instead of hoarding.
 */
export function resolveRefine(
  batch: readonly { readonly resource: ResourceId; readonly amount: number }[],
  yieldBonus: number,
): RefineResult {
  let value = 0;
  let units = 0;
  for (const entry of batch) {
    const amount = Math.max(0, Math.floor(entry.amount));
    units += amount;
    value += RESOURCES[entry.resource].baseValue * amount;
  }
  const rate = REFINERY.baseYield + clamp(yieldBonus, 0, 0.25);
  const credits = Math.floor(value * rate);
  return {
    credits,
    xp: Math.round(credits * REFINERY.xpPerCredit),
    durationSec: Math.ceil(units * REFINERY.secPerUnit),
    unitsProcessed: units,
  };
}

/** Bounds a listing price so the marketplace cannot be used to shuffle absurd sums. */
export function isPriceSane(price: number, referenceValue: number): boolean {
  if (!Number.isFinite(price) || price <= 0) return false;
  if (!Number.isInteger(price)) return false;
  if (price > ECONOMY.maxListingPrice) return false;
  if (referenceValue <= 0) return true;
  return (
    price >= referenceValue * ECONOMY.minPriceMultiplier &&
    price <= referenceValue * ECONOMY.maxPriceMultiplier
  );
}
