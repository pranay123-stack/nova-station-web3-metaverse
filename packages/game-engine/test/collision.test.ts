import { describe, expect, it } from 'vitest';
import { getStationGeometry } from '@nova/game-data';
import {
  createCollisionWorld,
  groundAt,
  overlapsSolid,
  resolvePenetration,
  sweepAxis,
  surfaceHeightAt,
} from '../src/index.js';

const world = createCollisionWorld(getStationGeometry());

describe('surface height', () => {
  it('returns the flat height inside a floor and null outside it', () => {
    const floor = {
      kind: 'floor' as const,
      min: [0, 0] as const,
      max: [10, 10] as const,
      y: 3,
      area: 'habitat' as const,
      tag: 'test',
    };
    expect(surfaceHeightAt(floor, 5, 5)).toBe(3);
    expect(surfaceHeightAt(floor, 11, 5)).toBeNull();
    expect(surfaceHeightAt(floor, 5, -1)).toBeNull();
  });

  it('interpolates linearly along a ramp', () => {
    const ramp = {
      kind: 'ramp' as const,
      min: [0, 0] as const,
      max: [10, 20] as const,
      axis: 'z' as const,
      yStart: 0,
      yEnd: 10,
      area: 'corridor' as const,
      tag: 'test-ramp',
    };
    expect(surfaceHeightAt(ramp, 5, 0)).toBeCloseTo(0);
    expect(surfaceHeightAt(ramp, 5, 10)).toBeCloseTo(5);
    expect(surfaceHeightAt(ramp, 5, 20)).toBeCloseTo(10);
  });
});

describe('ground queries', () => {
  it('finds the habitat floor under the spawn point', () => {
    const ground = groundAt(world, 0, 14, 0.5, 0.55);
    expect(ground.y).toBe(0);
    expect(ground.tag).toContain('habitat');
  });

  it('finds the command deck floor at its raised height', () => {
    const ground = groundAt(world, 14, -140, 7.5, 0.55);
    expect(ground.y).toBe(7);
  });

  it('treats a low solid top as walkable ground', () => {
    // The holo-table dais in the middle of the command deck is 1m tall.
    const ground = groundAt(world, 0, -140, 7.5, 0.55);
    expect(ground.y).toBe(8);
    expect(ground.tag).toBe('cmd_holo_base');
  });

  it('follows the ramp up to the command deck', () => {
    const low = groundAt(world, 0, -92, 1, 0.55).y ?? -1;
    const mid = groundAt(world, 0, -106, 4, 0.55).y ?? -1;
    const high = groundAt(world, 0, -120, 7, 0.55).y ?? -1;
    expect(low).toBeLessThan(mid);
    expect(mid).toBeLessThan(high);
    expect(high).toBeGreaterThan(6);
  });

  it('ignores surfaces above the step height', () => {
    // Standing on the habitat floor, the command deck at +7m is not "ground".
    const ground = groundAt(world, 0, -140, 0, 0.55);
    expect(ground.y).toBeNull();
  });

  it('returns no ground outside the station footprint', () => {
    expect(groundAt(world, 500, 500, 0, 0.55).y).toBeNull();
  });
});

describe('solid overlap', () => {
  it('reports a point inside a wall as overlapping', () => {
    // The habitat west wall sits at x = -24.
    expect(overlapsSolid(world, -24, 0, 0.42, 0.5, 1.8)).toBe(true);
  });

  it('reports open floor as clear', () => {
    expect(overlapsSolid(world, 0, 14, 0.42, 0.5, 1.8)).toBe(false);
  });

  it('ignores solids entirely below the body', () => {
    // A 0.35m-tall pad is below a body spanning 0.6m..2.0m.
    expect(overlapsSolid(world, -98, -84, 0.42, 0.6, 2.0)).toBe(false);
  });
});

describe('sliding', () => {
  it('stops movement at a wall instead of passing through', () => {
    const result = sweepAxis(world, -22, 0, 'x', -6, 0.42, 0.5, 1.8);
    expect(result.hit).toBe(true);
    expect(result.value).toBeGreaterThan(-24);
  });

  it('leaves unobstructed movement untouched', () => {
    const result = sweepAxis(world, 0, 14, 'x', 1.5, 0.42, 0.5, 1.8);
    expect(result.hit).toBe(false);
    expect(result.value).toBeCloseTo(1.5);
  });

  it('lets a player through a doorway', () => {
    const result = sweepAxis(world, 0, -23, 'z', -3, 0.42, 0.5, 1.8);
    expect(result.hit).toBe(false);
    expect(result.value).toBeCloseTo(-26);
  });
});

describe('penetration recovery', () => {
  it('pushes a body that starts inside a wall back out', () => {
    const fixed = resolvePenetration(world, -24, 0, 0.42, 0.5, 1.8);
    expect(fixed.moved).toBe(true);
    expect(overlapsSolid(world, fixed.x, fixed.z, 0.4, 0.5, 1.8)).toBe(false);
  });

  it('leaves a body in open space alone', () => {
    const fixed = resolvePenetration(world, 0, 14, 0.42, 0.5, 1.8);
    expect(fixed.moved).toBe(false);
    expect(fixed.x).toBe(0);
    expect(fixed.z).toBe(14);
  });
});
