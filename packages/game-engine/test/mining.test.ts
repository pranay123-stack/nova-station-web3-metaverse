import { describe, expect, it } from 'vitest';
import { MINING_MINIGAME, RESOURCES, SHIPS_BY_ID } from '@nova/game-data';
import {
  computeShipStats,
  expeditionCost,
  resolveMining,
  rollHazard,
  type MiningAttempt,
} from '../src/index.js';

const miner = computeShipStats({ defId: 'pickaxe', upgrades: {}, moduleIds: [] });

function attempt(overrides: Partial<MiningAttempt> = {}): MiningAttempt {
  return {
    zoneId: 'nova_belt',
    shipStats: miner.stats,
    laserTier: miner.laserTier,
    elapsedSec: MINING_MINIGAME.extractSec,
    claimedHoldTicks: 0,
    cargoUsed: 0,
    seed: 12345,
    ...overrides,
  };
}

const total = (result: { yields: readonly { amount: number }[] }): number =>
  result.yields.reduce((sum, y) => sum + y.amount, 0);

describe('mining resolution', () => {
  it('is deterministic for the same seed and inputs', () => {
    const a = resolveMining(attempt(), 500);
    const b = resolveMining(attempt(), 500);
    expect(a).toEqual(b);
  });

  it('produces different hauls for different seeds', () => {
    const hauls = new Set(
      Array.from({ length: 12 }, (_, i) =>
        JSON.stringify(resolveMining(attempt({ seed: i * 977 }), 500).yields),
      ),
    );
    expect(hauls.size).toBeGreaterThan(1);
  });

  it('rewards a perfect minigame more than a failed one', () => {
    const perfect = resolveMining(
      attempt({ claimedHoldTicks: MINING_MINIGAME.extractSec * MINING_MINIGAME.tickHz }),
      500,
    );
    const failed = resolveMining(attempt({ claimedHoldTicks: 0 }), 500);
    expect(perfect.multiplier).toBeCloseTo(MINING_MINIGAME.maxMultiplier, 3);
    expect(failed.multiplier).toBeCloseTo(MINING_MINIGAME.minMultiplier, 3);
    expect(total(perfect)).toBeGreaterThan(total(failed));
  });

  it('clamps a client that claims more ticks than time allows', () => {
    const cheat = resolveMining(attempt({ claimedHoldTicks: 100_000 }), 500);
    const honest = resolveMining(
      attempt({ claimedHoldTicks: MINING_MINIGAME.extractSec * MINING_MINIGAME.tickHz }),
      500,
    );
    expect(cheat.clamped).toBe(true);
    expect(cheat.acceptedHoldTicks).toBe(cheat.maxPossibleTicks);
    expect(cheat.multiplier).toBeLessThanOrEqual(MINING_MINIGAME.maxMultiplier);
    expect(total(cheat)).toBe(total(honest));
  });

  it('bounds the whole value of playing the minigame perfectly', () => {
    // Across many seeds a flawless run must never beat a failed one by more
    // than the multiplier band allows. This is the anti-cheat guarantee: the
    // most a lying client can gain is this ratio.
    const band = MINING_MINIGAME.maxMultiplier / MINING_MINIGAME.minMultiplier;
    let zeroSum = 0;
    let maxSum = 0;
    for (let seed = 0; seed < 200; seed += 1) {
      zeroSum += total(resolveMining(attempt({ seed, claimedHoldTicks: 0 }), 9999));
      maxSum += total(resolveMining(attempt({ seed, claimedHoldTicks: 999_999 }), 9999));
    }
    expect(maxSum / zeroSum).toBeGreaterThan(1);
    expect(maxSum / zeroSum).toBeLessThan(band * 1.15);
  });

  it('draws the same resources regardless of minigame skill', () => {
    const bad = resolveMining(attempt({ claimedHoldTicks: 0, seed: 777 }), 9999);
    const good = resolveMining(attempt({ claimedHoldTicks: 999_999, seed: 777 }), 9999);
    expect(good.yields.map((y) => y.resource)).toEqual(bad.yields.map((y) => y.resource));
  });

  it('clamps an absurd elapsed time', () => {
    const long = resolveMining(attempt({ elapsedSec: 100_000 }), 5000);
    const normal = resolveMining(attempt(), 5000);
    expect(total(long)).toBeLessThanOrEqual(total(normal) * 1.2);
  });

  it('ignores negative and non-finite tick claims', () => {
    expect(resolveMining(attempt({ claimedHoldTicks: -50 }), 500).acceptedHoldTicks).toBe(0);
    expect(resolveMining(attempt({ claimedHoldTicks: NaN }), 500).acceptedHoldTicks).toBe(0);
  });

  it('never yields more cargo weight than the hold allows', () => {
    const result = resolveMining(attempt({ claimedHoldTicks: 200 }), 6);
    let weight = 0;
    for (const y of result.yields) weight += RESOURCES[y.resource].weight * y.amount;
    expect(weight).toBeLessThanOrEqual(6);
    expect(result.cargoAdded).toBeLessThanOrEqual(6);
  });

  it('reports overflow rather than silently granting it', () => {
    const result = resolveMining(attempt({ claimedHoldTicks: 200 }), 2);
    expect(result.overflow.length).toBeGreaterThan(0);
  });

  it('yields nothing when the hold is already full', () => {
    const result = resolveMining(attempt({ cargoUsed: 500 }), 500);
    expect(result.yields).toEqual([]);
    expect(result.cargoAdded).toBe(0);
  });

  it('never returns resources the laser tier cannot cut', () => {
    // A tier-1 laser must never see platinum (tier 2) or above.
    for (let seed = 0; seed < 300; seed += 1) {
      const result = resolveMining(
        attempt({ laserTier: 1, zoneId: 'kestrel_reach', seed, claimedHoldTicks: 120 }),
        5000,
      );
      for (const y of result.yields) {
        expect(RESOURCES[y.resource].minLaserTier).toBeLessThanOrEqual(1);
      }
    }
  });

  it('yields nothing for an unknown zone', () => {
    const result = resolveMining(attempt({ zoneId: 'not_a_zone' }), 500);
    expect(result.yields).toEqual([]);
  });

  it('makes richer zones more valuable, not merely more numerous', () => {
    // Deep zones drop fewer *units* but far more valuable ones, so the economy
    // is compared in credits rather than in raw counts.
    const value = (result: { yields: readonly { resource: keyof typeof RESOURCES; amount: number }[] }) =>
      result.yields.reduce((sum, y) => sum + RESOURCES[y.resource].baseValue * y.amount, 0);
    const belt = Array.from({ length: 40 }, (_, i) =>
      value(resolveMining(attempt({ zoneId: 'nova_belt', seed: i, claimedHoldTicks: 60 }), 9999)),
    ).reduce((a, b) => a + b, 0);
    const claim = Array.from({ length: 40 }, (_, i) =>
      value(
        resolveMining(
          attempt({ zoneId: 'helix_claim', seed: i, claimedHoldTicks: 60, laserTier: 4 }),
          9999,
        ),
      ),
    ).reduce((a, b) => a + b, 0);
    expect(claim).toBeGreaterThan(belt * 3);
  });

  it('scales with mining power', () => {
    const weak = { ...miner.stats, miningPower: 10 };
    const strong = { ...miner.stats, miningPower: 60 };
    const weakTotal = total(resolveMining(attempt({ shipStats: weak }), 9999));
    const strongTotal = total(resolveMining(attempt({ shipStats: strong }), 9999));
    expect(strongTotal).toBeGreaterThan(weakTotal * 2);
  });
});

describe('expeditions', () => {
  it('prices fuel and travel for a known zone', () => {
    const cost = expeditionCost('nova_belt', miner.stats);
    expect(cost).not.toBeNull();
    expect(cost?.fuel).toBeGreaterThan(0);
    expect(cost?.travelSec).toBeGreaterThan(0);
  });

  it('returns null for an unknown zone', () => {
    expect(expeditionCost('nowhere', miner.stats)).toBeNull();
  });

  it('gets a faster ship there sooner', () => {
    const scout = SHIPS_BY_ID.get('kestrel');
    const hauler = SHIPS_BY_ID.get('mule');
    expect(scout && hauler).toBeTruthy();
    const fast = expeditionCost('kestrel_reach', scout!.baseStats);
    const slow = expeditionCost('kestrel_reach', hauler!.baseStats);
    expect(fast!.travelSec).toBeLessThan(slow!.travelSec);
  });

  it('rolls hazards that defense mitigates', () => {
    const fragile = { ...miner.stats, defense: 0 };
    const armoured = { ...miner.stats, defense: 120 };
    let fragileHits = 0;
    let armouredHits = 0;
    for (let seed = 0; seed < 600; seed += 1) {
      if (rollHazard('the_rift', fragile, seed).triggered) fragileHits += 1;
      if (rollHazard('the_rift', armoured, seed).triggered) armouredHits += 1;
    }
    expect(fragileHits).toBeGreaterThan(armouredHits);
  });

  it('never destroys more than a fraction of the hold', () => {
    for (let seed = 0; seed < 500; seed += 1) {
      const roll = rollHazard('the_rift', miner.stats, seed);
      expect(roll.cargoLossFraction).toBeLessThanOrEqual(0.28);
      expect(roll.cargoLossFraction).toBeGreaterThanOrEqual(0);
    }
  });
});
