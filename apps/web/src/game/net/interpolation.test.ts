import { describe, expect, it } from 'vitest';
import { INTERPOLATION_DELAY_MS, RemoteBuffer } from './interpolation';

/**
 * The interpolation buffer decides what other players look like, and it is the
 * one piece of the networking layer with logic worth testing in isolation: it
 * has to survive dropped packets, out-of-order timing and a player teleporting
 * without ever putting a body somewhere absurd.
 */
const pose = (id: string, x: number, z: number, yaw = 0) => ({
  id,
  x,
  y: 0,
  z,
  yaw,
  s: 'walk' as const,
});

describe('RemoteBuffer', () => {
  it('returns null for a player it has never seen', () => {
    const buffer = new RemoteBuffer();
    expect(buffer.sample('nobody')).toBeNull();
  });

  it('holds at the only known sample rather than guessing', () => {
    const buffer = new RemoteBuffer();
    buffer.ingest([pose('a', 5, 10)], 1000);
    const sampled = buffer.sample('a', 1000 + INTERPOLATION_DELAY_MS);
    expect(sampled?.x).toBe(5);
    expect(sampled?.z).toBe(10);
  });

  it('interpolates between two snapshots at the render time', () => {
    const buffer = new RemoteBuffer();
    buffer.ingest([pose('a', 0, 0)], 1000);
    // A running player covers under a metre per snapshot; anything much larger
    // is treated as a teleport by design and is covered separately below.
    buffer.ingest([pose('a', 1, 2)], 1100);

    // Render 150ms in the past: at t=1050 the body is halfway between them.
    const sampled = buffer.sample('a', 1050 + INTERPOLATION_DELAY_MS);
    expect(sampled?.x).toBeCloseTo(0.5, 4);
    expect(sampled?.z).toBeCloseTo(1, 4);
  });

  it('reports a speed that drives the walk cycle', () => {
    const buffer = new RemoteBuffer();
    buffer.ingest([pose('a', 0, 0)], 1000);
    buffer.ingest([pose('a', 0, 1)], 1100);
    const sampled = buffer.sample('a', 1050 + INTERPOLATION_DELAY_MS);
    // One metre in 100ms is 10 m/s.
    expect(sampled?.speed).toBeCloseTo(10, 1);
  });

  it('takes the shortest path around the compass when yaw wraps', () => {
    const buffer = new RemoteBuffer();
    buffer.ingest([pose('a', 0, 0, 3.0)], 1000);
    buffer.ingest([pose('a', 0, 0, -3.0)], 1100);
    const sampled = buffer.sample('a', 1050 + INTERPOLATION_DELAY_MS);
    // Naive interpolation would spin the body the long way round through zero;
    // the shortest path continues past pi instead.
    expect(Math.abs(sampled?.yaw ?? 0)).toBeGreaterThan(3.0);
  });

  it('snaps rather than sliding across the room on a large jump', () => {
    const buffer = new RemoteBuffer();
    buffer.ingest([pose('a', 0, 0)], 1000);
    buffer.ingest([pose('a', 100, 100)], 1100);
    const sampled = buffer.sample('a', 1050 + INTERPOLATION_DELAY_MS);
    expect(sampled?.x).toBe(100);
    expect(sampled?.z).toBe(100);
  });

  it('holds at the newest sample when the stream stalls', () => {
    const buffer = new RemoteBuffer();
    buffer.ingest([pose('a', 0, 0)], 1000);
    buffer.ingest([pose('a', 4, 4)], 1100);
    // Render time far ahead of anything received: do not extrapolate.
    const sampled = buffer.sample('a', 9000);
    expect(sampled?.x).toBe(4);
    expect(sampled?.speed).toBe(0);
  });

  it('bounds how much history it keeps', () => {
    const buffer = new RemoteBuffer();
    for (let i = 0; i < 200; i += 1) {
      buffer.ingest([pose('a', i * 0.5, 0)], 1000 + i * 100);
    }
    // Old samples are dropped, so a long session cannot grow the buffer without
    // limit. Asking for a moment long past now yields the oldest kept sample,
    // which is far from where the player started.
    const oldest = buffer.sample('a', 1000);
    expect(oldest?.x).toBeGreaterThan(50);
  });

  it('forgets a player who left', () => {
    const buffer = new RemoteBuffer();
    buffer.ingest([pose('a', 1, 1)], 1000);
    expect(buffer.ids()).toEqual(['a']);
    buffer.forget('a');
    expect(buffer.sample('a')).toBeNull();
    expect(buffer.ids()).toEqual([]);
  });

  it('tracks several players independently', () => {
    const buffer = new RemoteBuffer();
    buffer.ingest([pose('a', 0, 0), pose('b', 50, 50)], 1000);
    buffer.ingest([pose('a', 2, 0), pose('b', 52, 50)], 1100);
    const a = buffer.sample('a', 1050 + INTERPOLATION_DELAY_MS);
    const b = buffer.sample('b', 1050 + INTERPOLATION_DELAY_MS);
    expect(a?.x).toBeCloseTo(1, 4);
    expect(b?.x).toBeCloseTo(51, 4);
  });

  it('clears everything on disconnect', () => {
    const buffer = new RemoteBuffer();
    buffer.ingest([pose('a', 1, 1), pose('b', 2, 2)], 1000);
    buffer.clear();
    expect(buffer.ids()).toEqual([]);
  });
});
