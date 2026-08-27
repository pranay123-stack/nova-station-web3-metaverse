import { randomBytes, createHash, randomUUID } from 'node:crypto';

export function uuid(): string {
  return randomUUID();
}

/** URL-safe random token, used for SIWE nonces and session tokens. */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

/** Alphanumeric nonce matching the strict SIWE parser's expectations. */
export function randomNonce(): string {
  return randomBytes(16).toString('hex');
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/**
 * A 32-bit seed derived from server-only entropy.
 *
 * Every economic roll draws from one of these. Because the client never sees
 * the seed, it cannot predict — let alone choose — the outcome of a mining run
 * or a rare drop.
 *
 * The value is *signed*: Postgres `integer` is signed 32-bit, so an unsigned
 * seed above 2^31 would fail to store. The engine's RNG coerces with `>>> 0`
 * before use, so the full 32 bits of entropy survive the round trip.
 */
export function secureSeed(): number {
  return randomBytes(4).readInt32BE(0);
}

export function seedToBigInt(seed: number): bigint {
  // Stored unsigned so the value reads sensibly in the database.
  return BigInt(seed >>> 0);
}

export function bigIntToSeed(value: bigint): number {
  return Number(BigInt.asUintN(32, value));
}
