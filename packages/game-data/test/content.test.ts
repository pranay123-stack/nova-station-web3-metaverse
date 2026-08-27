import { describe, expect, it } from 'vitest';
import {
  ACHIEVEMENTS,
  COSMETICS_BY_ID,
  EQUIPMENT_BY_ID,
  FACTIONS,
  INTERACTABLES,
  MAX_FACTION_RANK,
  MINING_ZONES,
  MISSIONS,
  MODULES_BY_ID,
  RECIPES,
  RECIPES_BY_ID,
  RESOURCES,
  SHIPS,
  STATION_AREAS,
  STATION_AREA_IDS,
  areaAtPosition,
  getStationGeometry,
  levelForXp,
  totalXpForLevel,
  xpToNextLevel,
  MAX_LEVEL,
  STARTER_SHIP_ID,
  SHIPS_BY_ID,
  isResourceId,
} from '../src/index.js';
import type { StationAreaId } from '../src/index.js';

const uniq = <T>(xs: readonly T[]): number => new Set(xs).size;

describe('content integrity', () => {
  it('has unique ids across every catalogue', () => {
    expect(uniq(SHIPS.map((s) => s.id))).toBe(SHIPS.length);
    expect(uniq(MISSIONS.map((m) => m.id))).toBe(MISSIONS.length);
    expect(uniq(MISSIONS.map((m) => m.code))).toBe(MISSIONS.length);
    expect(uniq(RECIPES.map((r) => r.id))).toBe(RECIPES.length);
    expect(uniq(ACHIEVEMENTS.map((a) => a.id))).toBe(ACHIEVEMENTS.length);
    expect(uniq(INTERACTABLES.map((i) => i.id))).toBe(INTERACTABLES.length);
    expect(uniq(MINING_ZONES.map((z) => z.id))).toBe(MINING_ZONES.length);
  });

  it('resolves every recipe input to a real resource', () => {
    for (const recipe of RECIPES) {
      for (const input of recipe.inputs) {
        expect(isResourceId(input.resource), `${recipe.id} -> ${input.resource}`).toBe(true);
        expect(input.amount).toBeGreaterThan(0);
      }
      expect(recipe.creditCost).toBeGreaterThanOrEqual(0);
      expect(recipe.durationSec).toBeGreaterThan(0);
    }
  });

  it('resolves every recipe output to a real item', () => {
    for (const recipe of RECIPES) {
      const { kind, id } = recipe.output;
      const found =
        kind === 'module'
          ? MODULES_BY_ID.has(id)
          : kind === 'equipment'
            ? EQUIPMENT_BY_ID.has(id)
            : kind === 'cosmetic'
              ? COSMETICS_BY_ID.has(id)
              : isResourceId(id);
      expect(found, `${recipe.id} -> ${kind}:${id}`).toBe(true);
    }
  });

  it('resolves every mission reward and objective reference', () => {
    for (const mission of MISSIONS) {
      expect(mission.objectives.length).toBeGreaterThan(0);
      for (const objective of mission.objectives) {
        switch (objective.kind) {
          case 'mine':
          case 'deliver':
            expect(isResourceId(objective.resource)).toBe(true);
            break;
          case 'visit':
            expect(STATION_AREA_IDS).toContain(objective.area);
            break;
          case 'scan':
          case 'expedition':
            expect(MINING_ZONES.some((z) => z.id === objective.zone)).toBe(true);
            break;
          case 'craft':
            expect(RECIPES_BY_ID.has(objective.recipe)).toBe(true);
            break;
          default:
            break;
        }
      }
      const drop = mission.reward.rareDrop;
      if (drop) {
        const ok =
          drop.kind === 'module'
            ? MODULES_BY_ID.has(drop.id)
            : drop.kind === 'equipment'
              ? EQUIPMENT_BY_ID.has(drop.id)
              : drop.kind === 'cosmetic'
                ? COSMETICS_BY_ID.has(drop.id)
                : isResourceId(drop.id);
        expect(ok, `${mission.id} rare drop ${drop.id}`).toBe(true);
        expect(mission.reward.rareChance ?? 0).toBeGreaterThan(0);
      }
      for (const res of mission.reward.resources ?? []) {
        expect(isResourceId(res.resource)).toBe(true);
      }
    }
  });

  it('gates missions behind ranks that exist', () => {
    for (const mission of MISSIONS) {
      expect(mission.requiredFactionRank).toBeLessThanOrEqual(MAX_FACTION_RANK);
      expect(FACTIONS[mission.faction]).toBeDefined();
      expect(mission.difficulty).toBeGreaterThanOrEqual(1);
      expect(mission.difficulty).toBeLessThanOrEqual(5);
    }
  });

  it('gives every mining zone a valid, non-empty drop table', () => {
    for (const zone of MINING_ZONES) {
      expect(zone.table.length).toBeGreaterThan(0);
      let total = 0;
      for (const row of zone.table) {
        expect(isResourceId(row.resource)).toBe(true);
        expect(row.weight).toBeGreaterThan(0);
        total += row.weight;
      }
      expect(total).toBeGreaterThan(0);
      expect(zone.fuelCost).toBeGreaterThan(0);
    }
  });

  it('starts every player with a ship that exists and costs nothing', () => {
    const starter = SHIPS_BY_ID.get(STARTER_SHIP_ID);
    expect(starter).toBeDefined();
    expect(starter?.creditPrice).toBe(0);
    expect(starter?.requiredLevel).toBe(1);
  });

  it('keeps resource values monotonically increasing with rarity', () => {
    const order = ['iron', 'titanium', 'platinum', 'crystal', 'helium3', 'quantum_shard'] as const;
    let last = 0;
    for (const id of order) {
      const value = RESOURCES[id].baseValue;
      expect(value).toBeGreaterThan(last);
      last = value;
    }
  });
});

describe('progression maths', () => {
  it('is monotonic and self-consistent', () => {
    for (let level = 1; level < MAX_LEVEL; level += 1) {
      expect(totalXpForLevel(level + 1)).toBeGreaterThan(totalXpForLevel(level));
      expect(xpToNextLevel(level)).toBe(totalXpForLevel(level + 1) - totalXpForLevel(level));
      expect(levelForXp(totalXpForLevel(level))).toBe(level);
      expect(levelForXp(totalXpForLevel(level + 1) - 1)).toBe(level);
    }
  });

  it('clamps at the level cap', () => {
    expect(levelForXp(0)).toBe(1);
    expect(levelForXp(-500)).toBe(1);
    expect(levelForXp(Number.MAX_SAFE_INTEGER)).toBe(MAX_LEVEL);
    expect(xpToNextLevel(MAX_LEVEL)).toBe(0);
  });
});

describe('station geometry', () => {
  const geometry = getStationGeometry();

  it('builds walls, floors and finite bounds', () => {
    expect(geometry.solids.length).toBeGreaterThan(50);
    expect(geometry.surfaces.length).toBeGreaterThan(10);
    for (const v of [...geometry.bounds.min, ...geometry.bounds.max]) {
      expect(Number.isFinite(v)).toBe(true);
    }
  });

  it('keeps every solid box non-degenerate', () => {
    for (const solid of geometry.solids) {
      for (let axis = 0; axis < 3; axis += 1) {
        expect(solid.max[axis]).toBeGreaterThan(solid.min[axis]);
      }
    }
  });

  it('covers every area with a walkable floor', () => {
    for (const id of STATION_AREA_IDS) {
      const floor = geometry.surfaces.find((s) => s.kind === 'floor' && s.area === id);
      expect(floor, `missing floor for ${id}`).toBeDefined();
    }
  });

  it('leaves each doorway free of solids', () => {
    // Sample the centre line of every corridor mouth; nothing should block it.
    const mouths: readonly [number, number, number][] = [
      [0, 0, -24],
      [0, 0, -50],
      [-22, 0, -70],
      [-50, 0, -70],
      [22, 0, -70],
      [50, 0, -70],
      [0, 0, 24],
      [0, 0, 50],
      [0, 0, 90],
      [0, -4, 116],
    ];
    for (const [x, y, z] of mouths) {
      const blocked = geometry.solids.filter(
        (s) =>
          x > s.min[0] + 0.05 &&
          x < s.max[0] - 0.05 &&
          z > s.min[2] + 0.05 &&
          z < s.max[2] - 0.05 &&
          y + 1 > s.min[1] &&
          y + 1 < s.max[1],
      );
      expect(blocked.map((b) => b.tag), `doorway blocked at ${x},${z}`).toEqual([]);
    }
  });

  it('places interactables inside their own area and above its floor', () => {
    for (const item of INTERACTABLES) {
      const area = STATION_AREAS[item.area as Exclude<StationAreaId, 'corridor'>];
      expect(area, `unknown area ${item.area}`).toBeDefined();
      const [cx, , cz] = area.center;
      const [hx, hz] = area.halfExtents;
      expect(Math.abs(item.position[0] - cx)).toBeLessThanOrEqual(hx);
      expect(Math.abs(item.position[2] - cz)).toBeLessThanOrEqual(hz);
      expect(item.position[1]).toBeCloseTo(area.floorY, 5);
      expect(areaAtPosition(item.position[0], item.position[2])).toBe(item.area);
    }
  });

  it('locates the spawn point inside the habitat', () => {
    expect(areaAtPosition(0, 14)).toBe('habitat');
    expect(areaAtPosition(0, -70)).toBe('market');
    expect(areaAtPosition(0, -37)).toBe('corridor');
  });
});
