import { describe, expect, it } from 'vitest';
import { getStationGeometry } from '@nova/game-data';
import {
  DEFAULT_CHARACTER_PARAMS,
  createCollisionWorld,
  validateMovement,
} from '../src/index.js';

const world = createCollisionWorld(getStationGeometry());
const params = DEFAULT_CHARACTER_PARAMS;
const at = (x: number, y: number, z: number) => ({ x, y, z });

describe('server movement validation', () => {
  it('accepts an ordinary step', () => {
    const result = validateMovement(at(0, 0, 14), at(0.1, 0, 14), 0.1, params, world);
    expect(result.verdict).toBe('accepted');
    expect(result.position.x).toBeCloseTo(0.1);
  });

  it('rejects a teleport across the station', () => {
    const result = validateMovement(at(0, 0, 14), at(0, 7, -140), 0.1, params, world);
    expect(result.verdict).toBe('rejected');
    expect(result.reason).toBe('teleport');
    expect(result.position).toEqual(at(0, 0, 14));
  });

  it('corrects a speed hack', () => {
    const result = validateMovement(at(0, 0, 14), at(14, 0, 14), 0.1, params, world);
    expect(result.verdict).toBe('corrected');
    expect(result.reason).toBe('speed');
  });

  it('corrects a walk into geometry', () => {
    const result = validateMovement(at(-22.5, 0, 0), at(-24, 0, 0), 0.5, params, world);
    expect(result.verdict).toBe('corrected');
    expect(result.reason).toBe('inside geometry');
  });

  it('corrects flying', () => {
    const result = validateMovement(at(0, 0, 14), at(0, 20, 14), 1, params, world);
    expect(result.verdict).toBe('corrected');
    expect(result.reason).toBe('flying');
  });

  it('allows the height of a normal jump', () => {
    const result = validateMovement(at(0, 0, 14), at(0, 1.1, 14), 0.2, params, world);
    expect(result.verdict).toBe('accepted');
  });

  it('rejects positions outside the station', () => {
    const result = validateMovement(at(0, 0, 14), at(4000, 0, 14), 0.1, params, world);
    expect(result.verdict).toBe('rejected');
    expect(result.reason).toBe('out of station bounds');
  });

  it('rejects NaN and Infinity', () => {
    expect(validateMovement(at(0, 0, 14), at(NaN, 0, 14), 0.1, params, world).verdict).toBe(
      'rejected',
    );
    expect(
      validateMovement(at(0, 0, 14), at(0, Infinity, 14), 0.1, params, world).verdict,
    ).toBe('rejected');
  });

  it('corrects a step into the void beyond the floor', () => {
    const result = validateMovement(at(0, 0, 14), at(0, 0, 100), 20, params, world);
    expect(result.verdict).not.toBe('accepted');
  });

  it('is tolerant of a laggy but legal burst', () => {
    // 500ms of sprinting is roughly 4.3m; the tolerance must not flag it.
    const result = validateMovement(at(0, 0, 14), at(0, 0, 9.7), 0.5, params, world);
    expect(result.verdict).toBe('accepted');
  });
});
