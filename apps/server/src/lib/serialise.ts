/**
 * JSON has no bigint. Rather than losing precision silently, every bigint that
 * crosses the API boundary is converted to a string at exactly one place.
 */
export function bigIntToString(value: bigint): string {
  return value.toString();
}

/** Narrows a bigint to a JS number, for values known to be small (XP, levels). */
export function toNumber(value: bigint): number {
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) return Number.MAX_SAFE_INTEGER;
  if (value < BigInt(Number.MIN_SAFE_INTEGER)) return Number.MIN_SAFE_INTEGER;
  return Number(value);
}

export function clampBigInt(value: bigint, min: bigint, max: bigint): bigint {
  return value < min ? min : value > max ? max : value;
}

/** Recursively replaces bigints with strings so a payload is JSON-safe. */
export function jsonSafe<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value, (_key, raw) => (typeof raw === 'bigint' ? raw.toString() : raw)),
  ) as T;
}
