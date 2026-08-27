import { describe, expect, it } from 'vitest';
import {
  ECONOMY,
  MAX_UPGRADE_TIER,
  MISSIONS_BY_ID,
  RECIPES_BY_ID,
  RESOURCES,
  SHIPS_BY_ID,
  MAX_LEVEL,
  totalXpForLevel,
} from '@nova/game-data';
import {
  applyEvent,
  applyReputation,
  applyXp,
  canAcceptMission,
  canAfford,
  canUpgrade,
  cargoWeight,
  checkCraft,
  computeFee,
  computeShipStats,
  craftIsReady,
  craftRemainingSec,
  describeItem,
  emptyStanding,
  feeDiscountFor,
  initialProgress,
  isComplete,
  isPriceSane,
  missionExpired,
  progressFraction,
  rankFor,
  rankProgress,
  resolveCraft,
  resolveMissionReward,
  resolveRefine,
  stationBuyPrice,
  stationSellPrice,
  upgradeCost,
  type CraftContext,
} from '../src/index.js';

/* ------------------------------------------------------------------ ships */

describe('ship stats', () => {
  it('returns base stats for a stock hull', () => {
    const def = SHIPS_BY_ID.get('kestrel')!;
    const ship = computeShipStats({ defId: 'kestrel', upgrades: {}, moduleIds: [] });
    expect(ship.stats).toEqual(def.baseStats);
    expect(ship.moduleSlots).toBe(def.moduleSlots);
  });

  it('applies upgrade tiers proportionally to the base value', () => {
    const base = computeShipStats({ defId: 'pickaxe', upgrades: {}, moduleIds: [] });
    const upgraded = computeShipStats({
      defId: 'pickaxe',
      upgrades: { miningPower: 2 },
      moduleIds: [],
    });
    expect(upgraded.stats.miningPower).toBeCloseTo(base.stats.miningPower * 1.24, 2);
    expect(upgraded.stats.speed).toBe(base.stats.speed);
  });

  it('applies additive then multiplicative module effects in a fixed order', () => {
    const ship = computeShipStats({
      defId: 'pickaxe',
      upgrades: {},
      moduleIds: ['mining_laser_ii'],
    });
    // (26 base + 22 additive) * 1.1 multiplier
    expect(ship.stats.miningPower).toBeCloseTo((26 + 22) * 1.1, 2);
  });

  it('reports unknown modules instead of silently ignoring them', () => {
    const ship = computeShipStats({
      defId: 'kestrel',
      upgrades: {},
      moduleIds: ['not_a_module'],
    });
    expect(ship.unknownModules).toEqual(['not_a_module']);
    expect(ship.usedSlots).toBe(0);
  });

  it('degrades safely for an unknown hull', () => {
    const ship = computeShipStats({ defId: 'ghost', upgrades: {}, moduleIds: [] });
    expect(ship.stats.speed).toBe(0);
    expect(ship.laserTier).toBe(0);
  });

  it('clamps upgrade tiers to the maximum', () => {
    const ship = computeShipStats({
      defId: 'kestrel',
      upgrades: { speed: 9999 },
      moduleIds: [],
    });
    const capped = computeShipStats({
      defId: 'kestrel',
      upgrades: { speed: MAX_UPGRADE_TIER },
      moduleIds: [],
    });
    expect(ship.stats.speed).toBe(capped.stats.speed);
    expect(canUpgrade(MAX_UPGRADE_TIER)).toBe(false);
    expect(canUpgrade(0)).toBe(true);
  });

  it('ignores negative and non-finite tiers', () => {
    const ship = computeShipStats({
      defId: 'kestrel',
      upgrades: { speed: -5, cargo: NaN },
      moduleIds: [],
    });
    const base = SHIPS_BY_ID.get('kestrel')!.baseStats;
    expect(ship.stats.speed).toBe(base.speed);
    expect(ship.stats.cargo).toBe(base.cargo);
  });

  it('makes each upgrade tier cost more than the last', () => {
    let previous = 0;
    for (let tier = 0; tier < MAX_UPGRADE_TIER; tier += 1) {
      const cost = upgradeCost(tier, 'speed');
      expect(cost.credits).toBeGreaterThan(previous);
      expect(cost.resources.length).toBeGreaterThan(0);
      previous = cost.credits;
    }
  });

  it('raises the laser tier as mining power grows', () => {
    const stock = computeShipStats({ defId: 'kestrel', upgrades: {}, moduleIds: [] });
    const kitted = computeShipStats({
      defId: 'pickaxe',
      upgrades: { miningPower: MAX_UPGRADE_TIER },
      moduleIds: ['harmonic_extractor'],
    });
    expect(kitted.laserTier).toBeGreaterThan(stock.laserTier);
    expect(kitted.laserTier).toBe(4);
  });
});

/* -------------------------------------------------------------- inventory */

describe('inventory helpers', () => {
  it('describes every item kind', () => {
    expect(describeItem({ kind: 'resource', id: 'iron' })?.name).toBe('Iron');
    expect(describeItem({ kind: 'module', id: 'ion_thruster' })?.rarity).toBe('uncommon');
    expect(describeItem({ kind: 'equipment', id: 'suit_standard' })).not.toBeNull();
    expect(describeItem({ kind: 'cosmetic', id: 'visor_ice' })?.stackable).toBe(false);
  });

  it('returns null for unknown items', () => {
    expect(describeItem({ kind: 'resource', id: 'unobtainium' })).toBeNull();
    expect(describeItem({ kind: 'module', id: 'nope' })).toBeNull();
  });

  it('weighs cargo by resource weight', () => {
    expect(cargoWeight([{ resource: 'iron', amount: 10 }])).toBe(10);
    expect(cargoWeight([{ resource: 'quantum_shard', amount: 10 }])).toBe(2);
  });

  it('reports exactly what an unaffordable cost is short of', () => {
    const result = canAfford({ iron: 5 }, [
      { resource: 'iron', amount: 20 },
      { resource: 'titanium', amount: 3 },
    ]);
    expect(result.ok).toBe(false);
    expect(result.missing).toEqual([
      { resource: 'iron', amount: 15 },
      { resource: 'titanium', amount: 3 },
    ]);
  });

  it('accepts an exactly sufficient bag', () => {
    expect(canAfford({ iron: 20 }, [{ resource: 'iron', amount: 20 }]).ok).toBe(true);
  });
});

/* --------------------------------------------------------------- crafting */

const craftCtx = (overrides: Partial<CraftContext> = {}): CraftContext => ({
  level: 20,
  credits: 100_000,
  resources: { iron: 999, titanium: 999, platinum: 999, crystal: 999, helium3: 999, quantum_shard: 999 },
  factionRanks: { federation: 7, helix: 7, void: 7 },
  area: 'lab',
  benchBusy: false,
  ...overrides,
});

describe('crafting', () => {
  it('accepts a craft when every precondition is met', () => {
    expect(checkCraft('recipe_mining_laser_i', craftCtx()).ok).toBe(true);
  });

  it('rejects an unknown recipe', () => {
    expect(checkCraft('nope', craftCtx()).reason).toBe('unknown_recipe');
  });

  it('rejects crafting away from the bench', () => {
    expect(checkCraft('recipe_mining_laser_i', craftCtx({ area: 'habitat' })).reason).toBe(
      'wrong_station',
    );
  });

  it('rejects an under-levelled crafter', () => {
    expect(checkCraft('recipe_harmonic_extractor', craftCtx({ level: 2 })).reason).toBe('level');
  });

  it('rejects insufficient faction standing', () => {
    const ctx = craftCtx({ factionRanks: { federation: 0, helix: 7, void: 7 } });
    expect(checkCraft('recipe_harmonic_extractor', ctx).reason).toBe('faction');
  });

  it('rejects insufficient credits and resources, and names the shortfall', () => {
    expect(checkCraft('recipe_mining_laser_i', craftCtx({ credits: 0 })).reason).toBe('credits');
    const short = checkCraft('recipe_mining_laser_i', craftCtx({ resources: { iron: 1 } }));
    expect(short.reason).toBe('resources');
    expect(short.missing?.length).toBeGreaterThan(0);
  });

  it('rejects a second craft while the bench is busy', () => {
    expect(checkCraft('recipe_mining_laser_i', craftCtx({ benchBusy: true })).reason).toBe(
      'bench_busy',
    );
  });

  it('resolves deterministically and awards the bonus sometimes', () => {
    const recipe = RECIPES_BY_ID.get('recipe_mining_laser_i')!;
    expect(resolveCraft(recipe, 5)).toEqual(resolveCraft(recipe, 5));
    let bonuses = 0;
    for (let seed = 0; seed < 2000; seed += 1) {
      if (resolveCraft(recipe, seed).bonusApplied) bonuses += 1;
    }
    const rate = bonuses / 2000;
    expect(rate).toBeGreaterThan(recipe.bonusChance * 0.6);
    expect(rate).toBeLessThan(recipe.bonusChance * 1.6);
  });

  it('never produces less than the recipe promises', () => {
    const recipe = RECIPES_BY_ID.get('recipe_cargo_expander')!;
    for (let seed = 0; seed < 200; seed += 1) {
      expect(resolveCraft(recipe, seed).amount).toBeGreaterThanOrEqual(recipe.output.amount);
    }
  });

  it('counts down and reports readiness', () => {
    const recipe = RECIPES_BY_ID.get('recipe_mining_laser_i')!;
    const start = 1_000_000;
    expect(craftRemainingSec(recipe, start, start)).toBe(recipe.durationSec);
    expect(craftIsReady(recipe, start, start)).toBe(false);
    expect(craftIsReady(recipe, start, start + recipe.durationSec * 1000)).toBe(true);
    expect(craftRemainingSec(recipe, start, start + 1e9)).toBe(0);
  });
});

/* --------------------------------------------------------------- missions */

describe('missions', () => {
  const mission = MISSIONS_BY_ID.get('lost_mining_drone')!;

  it('starts at zero progress', () => {
    expect(initialProgress(mission)).toEqual([0, 0]);
    expect(isComplete(mission, initialProgress(mission))).toBe(false);
  });

  it('advances only the objectives an event matches', () => {
    const after = applyEvent(mission, [0, 0], { kind: 'expedition', zone: 'kestrel_reach' });
    expect(after.progress).toEqual([1, 0]);
    expect(after.changed).toBe(true);
    expect(after.complete).toBe(false);
  });

  it('ignores events for a different zone or resource', () => {
    const after = applyEvent(mission, [0, 0], { kind: 'expedition', zone: 'the_rift' });
    expect(after.changed).toBe(false);
    expect(after.progress).toEqual([0, 0]);
  });

  it('clamps progress at the objective target', () => {
    const after = applyEvent(mission, [0, 0], { kind: 'mined', resource: 'iron', amount: 100_000 });
    expect(after.progress[1]).toBe(150);
  });

  it('completes when every objective is met', () => {
    let progress = initialProgress(mission);
    progress = applyEvent(mission, progress, { kind: 'expedition', zone: 'kestrel_reach' }).progress;
    const final = applyEvent(mission, progress, {
      kind: 'mined',
      resource: 'titanium',
      amount: 150,
    });
    expect(final.complete).toBe(true);
    expect(progressFraction(mission, final.progress)).toBe(1);
  });

  it('matches a specific-resource objective only for that resource', () => {
    const helium = MISSIONS_BY_ID.get('helium_run')!;
    expect(
      applyEvent(helium, [0], { kind: 'mined', resource: 'iron', amount: 50 }).changed,
    ).toBe(false);
    expect(
      applyEvent(helium, [0], { kind: 'mined', resource: 'helium3', amount: 50 }).changed,
    ).toBe(true);
  });

  it('tracks visit, craft, refine and sell objectives', () => {
    const visit = MISSIONS_BY_ID.get('station_orientation')!;
    expect(applyEvent(visit, [0], { kind: 'visited', area: 'command_deck' }).complete).toBe(true);
    expect(applyEvent(visit, [0], { kind: 'visited', area: 'hangar' }).complete).toBe(false);

    const craft = MISSIONS_BY_ID.get('lab_commission')!;
    expect(
      applyEvent(craft, [0], { kind: 'crafted', recipe: 'recipe_survey_scanner', amount: 1 })
        .complete,
    ).toBe(true);

    const refine = MISSIONS_BY_ID.get('refinery_backlog')!;
    expect(applyEvent(refine, [0], { kind: 'refined', amount: 300 }).complete).toBe(true);

    const sell = MISSIONS_BY_ID.get('market_maker')!;
    expect(applyEvent(sell, [0], { kind: 'sold', amount: 5 }).complete).toBe(true);
  });

  const acceptCtx = (overrides = {}) => ({
    level: 30,
    factionRanks: { federation: 7, helix: 7, void: 7 },
    activeShipClass: 'explorer' as const,
    activeMissionCount: 0,
    maxActive: 4,
    alreadyActive: false,
    completedBefore: false,
    lastCompletedAtMs: null,
    nowMs: 1_000_000,
    ...overrides,
  });

  it('accepts a mission whose gates are all satisfied', () => {
    expect(canAcceptMission('lost_mining_drone', acceptCtx()).ok).toBe(true);
  });

  it('refuses an unknown mission', () => {
    expect(canAcceptMission('nope', acceptCtx()).reason).toBe('unknown_mission');
  });

  it('enforces level, faction and ship-class gates', () => {
    expect(canAcceptMission('deep_field_charting', acceptCtx({ level: 2 })).reason).toBe('level');
    expect(
      canAcceptMission(
        'deep_field_charting',
        acceptCtx({ factionRanks: { federation: 0, helix: 7, void: 7 } }),
      ).reason,
    ).toBe('faction');
    expect(
      canAcceptMission('escort_duty', acceptCtx({ activeShipClass: 'miner' })).reason,
    ).toBe('ship_class');
  });

  it('refuses duplicates, overflow and non-repeatables', () => {
    expect(canAcceptMission('iron_quota', acceptCtx({ alreadyActive: true })).reason).toBe(
      'already_active',
    );
    expect(canAcceptMission('iron_quota', acceptCtx({ activeMissionCount: 4 })).reason).toBe(
      'too_many_active',
    );
    expect(canAcceptMission('first_haul', acceptCtx({ completedBefore: true })).reason).toBe(
      'not_repeatable',
    );
  });

  it('enforces the repeat cooldown', () => {
    const justDone = acceptCtx({ completedBefore: true, lastCompletedAtMs: 1_000_000 });
    expect(canAcceptMission('iron_quota', justDone).reason).toBe('cooldown');
    const longAgo = acceptCtx({
      completedBefore: true,
      lastCompletedAtMs: 1_000_000 - 60 * 31 * 1000,
    });
    expect(canAcceptMission('iron_quota', longAgo).ok).toBe(true);
  });

  it('expires a mission past its deadline', () => {
    const accepted = 1_000_000;
    expect(missionExpired(mission, accepted, accepted + 1000)).toBe(false);
    expect(missionExpired(mission, accepted, accepted + mission.durationSec * 1000 + 1)).toBe(true);
  });

  it('resolves rewards deterministically with a bounded rare-drop rate', () => {
    expect(resolveMissionReward(mission, 11)).toEqual(resolveMissionReward(mission, 11));
    let drops = 0;
    for (let seed = 0; seed < 2000; seed += 1) {
      if (resolveMissionReward(mission, seed).rareDrop) drops += 1;
    }
    const rate = drops / 2000;
    expect(rate).toBeGreaterThan((mission.reward.rareChance ?? 0) * 0.7);
    expect(rate).toBeLessThan((mission.reward.rareChance ?? 0) * 1.3);
  });

  it('never drops a rare item for a mission that has none', () => {
    const plain = MISSIONS_BY_ID.get('station_orientation')!;
    for (let seed = 0; seed < 200; seed += 1) {
      expect(resolveMissionReward(plain, seed).rareDrop).toBeNull();
    }
  });
});

/* ------------------------------------------------------------ progression */

describe('progression', () => {
  it('levels up when the threshold is crossed and pays a bonus', () => {
    const result = applyXp(0, totalXpForLevel(3));
    expect(result.level).toBe(3);
    expect(result.levelsGained).toBe(2);
    expect(result.creditBonus).toBeGreaterThan(0);
  });

  it('reports progress within the current level', () => {
    const base = totalXpForLevel(5);
    const result = applyXp(base, 10);
    expect(result.level).toBe(5);
    expect(result.xpIntoLevel).toBe(10);
    expect(result.xpForLevel).toBeGreaterThan(0);
  });

  it('ignores negative XP awards', () => {
    const result = applyXp(500, -900);
    expect(result.xp).toBe(500);
  });

  it('stops at the level cap', () => {
    const result = applyXp(0, Number.MAX_SAFE_INTEGER);
    expect(result.level).toBe(MAX_LEVEL);
    expect(result.xpForLevel).toBe(0);
  });

  it('raises the target faction and lowers its rival', () => {
    const change = applyReputation(emptyStanding(), 'void', 1000);
    expect(change.standing.void).toBe(1000);
    expect(change.deltas.federation).toBeLessThan(0);
    expect(change.standing.federation).toBe(0);
  });

  it('never lets reputation go negative', () => {
    let standing = emptyStanding();
    for (let i = 0; i < 10; i += 1) {
      standing = applyReputation(standing, 'void', 5000).standing;
    }
    expect(standing.federation).toBe(0);
  });

  it('reports rank gains as they happen', () => {
    const change = applyReputation(emptyStanding(), 'helix', 800);
    expect(change.ranksGained.helix).toBe(2);
  });

  it('maps reputation to the documented rank ladder', () => {
    expect(rankFor('helix', 0)).toBe(0);
    expect(rankFor('helix', 249)).toBe(0);
    expect(rankFor('helix', 250)).toBe(1);
    expect(rankFor('helix', 999_999)).toBe(7);
    expect(rankProgress('helix', 250).name).toBe('Visitor');
    expect(rankProgress('helix', 999_999).fraction).toBe(1);
    expect(rankProgress('helix', 0).fraction).toBe(0);
  });

  it('turns standing into a bounded fee discount', () => {
    expect(feeDiscountFor(emptyStanding())).toBe(0);
    const maxed = { federation: 999_999, helix: 999_999, void: 999_999 };
    expect(feeDiscountFor(maxed)).toBeCloseTo(0.25, 3);
  });
});

/* ----------------------------------------------------------------- economy */

describe('economy', () => {
  it('charges the base fee with no discount', () => {
    const fee = computeFee(10_000, 0);
    expect(fee.feeBps).toBe(ECONOMY.marketFeeBps);
    expect(fee.fee).toBe(250);
    expect(fee.net).toBe(9750);
  });

  it('splits the fee between the treasury and the vault', () => {
    const fee = computeFee(10_000, 0);
    expect(fee.treasuryCut + fee.vaultCut).toBe(fee.fee);
    expect(fee.treasuryCut).toBeGreaterThan(fee.vaultCut);
  });

  it('applies a faction discount but never below the floor', () => {
    expect(computeFee(10_000, 0.25).feeBps).toBeLessThan(ECONOMY.marketFeeBps);
    expect(computeFee(10_000, 0.99).feeBps).toBe(ECONOMY.minMarketFeeBps);
  });

  it('never returns a negative or fractional fee', () => {
    for (const price of [0, 1, 7, 999, 1_000_000]) {
      const fee = computeFee(price, 0);
      expect(Number.isInteger(fee.fee)).toBe(true);
      expect(fee.fee).toBeGreaterThanOrEqual(0);
      expect(fee.net).toBeGreaterThanOrEqual(0);
      expect(fee.fee + fee.net).toBe(price);
    }
  });

  it('keeps the station spread in the station favour', () => {
    for (const id of ['iron', 'quantum_shard'] as const) {
      expect(stationBuyPrice(id, 10)).toBeLessThan(RESOURCES[id].baseValue * 10);
      expect(stationSellPrice(id, 10)).toBeGreaterThan(RESOURCES[id].baseValue * 10);
      expect(stationSellPrice(id, 10)).toBeGreaterThan(stationBuyPrice(id, 10));
    }
  });

  it('refines ore into credits below face value', () => {
    const batch = [{ resource: 'iron' as const, amount: 100 }];
    const result = resolveRefine(batch, 0);
    expect(result.credits).toBeLessThan(RESOURCES.iron.baseValue * 100);
    expect(result.credits).toBeGreaterThan(0);
    expect(result.unitsProcessed).toBe(100);
    expect(result.durationSec).toBeGreaterThan(0);
  });

  it('pays more with a refining bonus, up to a cap', () => {
    const batch = [{ resource: 'titanium' as const, amount: 50 }];
    const plain = resolveRefine(batch, 0).credits;
    const bonus = resolveRefine(batch, 0.08).credits;
    const absurd = resolveRefine(batch, 99).credits;
    expect(bonus).toBeGreaterThan(plain);
    expect(absurd).toBe(resolveRefine(batch, 0.25).credits);
  });

  it('rejects nonsensical listing prices', () => {
    expect(isPriceSane(0, 100)).toBe(false);
    expect(isPriceSane(-5, 100)).toBe(false);
    expect(isPriceSane(1.5, 100)).toBe(false);
    expect(isPriceSane(NaN, 100)).toBe(false);
    expect(isPriceSane(ECONOMY.maxListingPrice + 1, 100)).toBe(false);
  });

  it('bounds listing prices around the reference value', () => {
    expect(isPriceSane(100, 100)).toBe(true);
    expect(isPriceSane(2500, 100)).toBe(true);
    expect(isPriceSane(2501, 100)).toBe(false);
    expect(isPriceSane(9, 100)).toBe(false);
  });

  it('allows any sane price when there is no reference value', () => {
    expect(isPriceSane(12_345, 0)).toBe(true);
  });
});
