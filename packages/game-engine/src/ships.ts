import {
  EMPTY_STATS,
  MAX_UPGRADE_TIER,
  MODULES_BY_ID,
  SHIPS_BY_ID,
  SHIP_STAT_KEYS,
  UPGRADE_BASE_CREDIT_COST,
  UPGRADE_COST_GROWTH,
  UPGRADE_RESOURCE_COST,
  UPGRADE_STAT_STEP,
  laserTierForMiningPower,
  type ResourceId,
  type ShipStats,
} from '@nova/game-data';

export type UpgradeMap = Partial<Record<keyof ShipStats, number>>;

export interface OwnedShipLike {
  readonly defId: string;
  readonly upgrades: UpgradeMap;
  readonly moduleIds: readonly string[];
}

export interface EffectiveShip {
  readonly stats: ShipStats;
  readonly laserTier: number;
  readonly moduleSlots: number;
  readonly usedSlots: number;
  /** Modules that were requested but do not exist; surfaced instead of silently dropped. */
  readonly unknownModules: readonly string[];
}

/**
 * Derives a ship's live stats.
 *
 * Order matters and is fixed: base → upgrade tiers → additive module stats →
 * multiplicative module stats. Server and client both call this, so an upgrade
 * preview in the hangar is exactly what the server will bill for.
 */
export function computeShipStats(ship: OwnedShipLike): EffectiveShip {
  const def = SHIPS_BY_ID.get(ship.defId);
  if (!def) {
    return {
      stats: { ...EMPTY_STATS },
      laserTier: 0,
      moduleSlots: 0,
      usedSlots: 0,
      unknownModules: [...ship.moduleIds],
    };
  }

  const stats: Record<keyof ShipStats, number> = { ...def.baseStats };

  for (const key of SHIP_STAT_KEYS) {
    const tier = clampTier(ship.upgrades[key] ?? 0);
    if (tier > 0) {
      stats[key] += def.baseStats[key] * UPGRADE_STAT_STEP * tier;
    }
  }

  const unknown: string[] = [];
  const multipliers: Partial<Record<keyof ShipStats, number>> = {};

  for (const moduleId of ship.moduleIds) {
    const mod = MODULES_BY_ID.get(moduleId);
    if (!mod) {
      unknown.push(moduleId);
      continue;
    }
    for (const key of SHIP_STAT_KEYS) {
      const delta = mod.stats[key];
      if (delta !== undefined) stats[key] += delta;
      const mult = mod.multipliers?.[key];
      if (mult !== undefined) multipliers[key] = (multipliers[key] ?? 1) * mult;
    }
  }

  for (const key of SHIP_STAT_KEYS) {
    const mult = multipliers[key];
    if (mult !== undefined) stats[key] *= mult;
    stats[key] = Math.max(0, Math.round(stats[key] * 100) / 100);
  }

  const upgradeSlotBonus = Math.floor(
    SHIP_STAT_KEYS.reduce((sum, key) => sum + clampTier(ship.upgrades[key] ?? 0), 0) / 6,
  );

  return {
    stats: stats as ShipStats,
    laserTier: laserTierForMiningPower(stats.miningPower),
    moduleSlots: def.moduleSlots + upgradeSlotBonus,
    usedSlots: ship.moduleIds.length - unknown.length,
    unknownModules: unknown,
  };
}

export function clampTier(tier: number): number {
  if (!Number.isFinite(tier)) return 0;
  return Math.max(0, Math.min(MAX_UPGRADE_TIER, Math.floor(tier)));
}

export interface UpgradeCost {
  readonly credits: number;
  readonly resources: readonly { readonly resource: ResourceId; readonly amount: number }[];
}

/** Cost of taking `stat` from its current tier to the next one. */
export function upgradeCost(currentTier: number, stat: keyof ShipStats): UpgradeCost {
  const tier = clampTier(currentTier);
  const scale = Math.pow(UPGRADE_COST_GROWTH, tier);
  // Mining and cargo upgrades are the economic backbone, so they cost a premium.
  const statWeight = stat === 'miningPower' || stat === 'cargo' ? 1.25 : 1;
  return {
    credits: Math.round(UPGRADE_BASE_CREDIT_COST * scale * statWeight),
    resources: UPGRADE_RESOURCE_COST.map((r) => ({
      resource: r.resource as ResourceId,
      amount: Math.round(r.amount * scale * statWeight),
    })),
  };
}

export function canUpgrade(currentTier: number): boolean {
  return clampTier(currentTier) < MAX_UPGRADE_TIER;
}
