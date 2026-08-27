import { describe, expect, it } from 'vitest';
import {
  formatCredits,
  formatDuration,
  formatEth,
  formatPlaytime,
  relativeTime,
  shortAddress,
  stars,
} from './format';

describe('display formatting', () => {
  it('abbreviates large credit balances but keeps small ones exact', () => {
    expect(formatCredits(950)).toBe('950');
    expect(formatCredits(12_500)).toBe('12.5k');
    expect(formatCredits(3_400_000)).toBe('3.40M');
  });

  it('survives non-finite input rather than printing NaN', () => {
    expect(formatCredits(Number.NaN)).toBe('0');
    expect(formatCredits(Infinity)).toBe('0');
  });

  it('shortens an address without mangling a short one', () => {
    expect(shortAddress('0x1234567890abcdef1234567890abcdef12345678')).toBe('0x1234…5678');
    expect(shortAddress('')).toBe('');
    expect(shortAddress(null)).toBe('');
    expect(shortAddress(undefined)).toBe('');
  });

  it('formats durations at the right granularity', () => {
    expect(formatDuration(45)).toBe('45s');
    expect(formatDuration(90)).toBe('1m 30s');
    expect(formatDuration(3700)).toBe('1h 01m');
    expect(formatDuration(90_000)).toBe('1d 1h');
    expect(formatDuration(-5)).toBe('0s');
  });

  it('formats playtime in hours and minutes', () => {
    expect(formatPlaytime(600)).toBe('10m');
    expect(formatPlaytime(7260)).toBe('2h 1m');
  });

  it('formats wei without losing the leading zeros of the fraction', () => {
    expect(formatEth('1000000000000000000')).toBe('1.0000');
    expect(formatEth('1500000000000000000')).toBe('1.5000');
    expect(formatEth('10000000000000000')).toBe('0.0100');
    expect(formatEth('not a number')).toBe('0.0000');
  });

  it('renders a difficulty rating out of five', () => {
    expect(stars(3)).toBe('★★★☆☆');
    expect(stars(0)).toBe('☆☆☆☆☆');
    expect(stars(99)).toBe('★★★★★');
  });

  it('describes recent timestamps in words', () => {
    expect(relativeTime(new Date().toISOString())).toBe('just now');
    expect(relativeTime(new Date(Date.now() - 90 * 60 * 1000).toISOString())).toBe('1h ago');
    expect(relativeTime('not a date')).toBe('unknown');
  });
});
