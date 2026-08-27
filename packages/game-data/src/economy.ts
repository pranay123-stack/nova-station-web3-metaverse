import type { Rarity } from './types.js';
import { RARITY_VALUE_MULTIPLIER } from './rarity.js';

/**
 * Economy constants. See ECONOMY.md for the full source/sink analysis.
 */
export const ECONOMY = {
  /** Marketplace fee taken by the station, in basis points. */
  marketFeeBps: 250,
  /** Fee floor after every faction discount has been applied, in basis points. */
  minMarketFeeBps: 100,
  /** Fee charged for listing an off-chain item, in credits. */
  listingFeeCredits: 50,
  /** Maximum simultaneous listings per player. */
  maxListingsPerPlayer: 25,
  /** Price bounds applied to credit listings, as a multiple of the reference value. */
  minPriceMultiplier: 0.1,
  maxPriceMultiplier: 25,
  /** Absolute credit cap on a single listing, to bound manipulation. */
  maxListingPrice: 50_000_000,
  /** Credits refunded per fuel unit at the Docking Bay. */
  fuelCreditsPerUnit: 3,
  /** Daily credit faucet for logging in, to keep new players moving. */
  dailyStipend: 500,
} as const;

/** Reference credit value used to price a crafted or dropped item. */
export function referenceItemValue(baseValue: number, rarity: Rarity): number {
  return Math.round(baseValue * RARITY_VALUE_MULTIPLIER[rarity]);
}

/**
 * Station buy/sell spread for raw resources at the Market console. The station
 * always buys below and sells above the base value, which is the main credit
 * sink keeping resource inflation in check.
 */
export const STATION_SPREAD = {
  buyFromPlayer: 0.86,
  sellToPlayer: 1.22,
} as const;

/** Fee split. The remainder after the treasury cut funds the reward vault. */
export const FEE_SPLIT = { treasuryBps: 6000, vaultBps: 4000 } as const;
