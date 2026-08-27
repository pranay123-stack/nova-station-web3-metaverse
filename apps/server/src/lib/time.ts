export const SECOND = 1000;
export const MINUTE = 60 * SECOND;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

export function now(): Date {
  return new Date();
}

export function addSeconds(date: Date, seconds: number): Date {
  return new Date(date.getTime() + seconds * SECOND);
}

export function secondsBetween(from: Date, to: Date): number {
  return (to.getTime() - from.getTime()) / SECOND;
}

export function secondsUntil(date: Date, from: Date = new Date()): number {
  return Math.max(0, Math.ceil((date.getTime() - from.getTime()) / SECOND));
}

export function isPast(date: Date, reference: Date = new Date()): boolean {
  return date.getTime() <= reference.getTime();
}

/** True when the two timestamps fall on different UTC days. */
export function isNewUtcDay(previous: Date | null, current: Date): boolean {
  if (!previous) return true;
  return previous.toISOString().slice(0, 10) !== current.toISOString().slice(0, 10);
}
