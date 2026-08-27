import { describe, expect, it } from 'vitest';
import { createRng, deriveSeed, hashSeed } from '../src/index.js';

describe('rng', () => {
  it('is deterministic for a given seed', () => {
    const a = createRng(1234);
    const b = createRng(1234);
    const seqA = Array.from({ length: 20 }, () => a.next());
    const seqB = Array.from({ length: 20 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it('produces different streams for different seeds', () => {
    const a = Array.from({ length: 10 }, (_, i) => createRng(i).next());
    expect(new Set(a).size).toBe(10);
  });

  it('stays inside [0, 1)', () => {
    const rng = createRng(99);
    for (let i = 0; i < 5000; i += 1) {
      const value = rng.next();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('respects integer bounds', () => {
    const rng = createRng(7);
    for (let i = 0; i < 2000; i += 1) {
      const value = rng.int(3, 9);
      expect(value).toBeGreaterThanOrEqual(3);
      expect(value).toBeLessThanOrEqual(9);
      expect(Number.isInteger(value)).toBe(true);
    }
  });

  it('picks proportionally to weight', () => {
    const rng = createRng(42);
    const items = [
      { id: 'a', w: 90 },
      { id: 'b', w: 10 },
    ];
    let a = 0;
    for (let i = 0; i < 10_000; i += 1) {
      if (rng.pick(items, (x) => x.w)?.id === 'a') a += 1;
    }
    expect(a / 10_000).toBeGreaterThan(0.85);
    expect(a / 10_000).toBeLessThan(0.95);
  });

  it('returns null for an empty or zero-weight table', () => {
    const rng = createRng(1);
    expect(rng.pick([], () => 1)).toBeNull();
    expect(rng.pick([{ w: 0 }], (x) => x.w)).toBeNull();
  });

  it('counts draws for audit records', () => {
    const rng = createRng(5);
    rng.next();
    rng.int(0, 3);
    expect(rng.draws()).toBe(2);
  });

  it('derives distinct seeds from a base and counter', () => {
    const base = hashSeed('session-abc');
    const seeds = new Set(Array.from({ length: 500 }, (_, i) => deriveSeed(base, i)));
    expect(seeds.size).toBe(500);
  });

  it('hashes strings stably', () => {
    expect(hashSeed('nova')).toBe(hashSeed('nova'));
    expect(hashSeed('nova')).not.toBe(hashSeed('novb'));
  });
});
