import { z } from 'zod';
import { FACTION_IDS, RESOURCE_IDS, STATION_AREA_IDS } from '@nova/game-data';

/** A 0x-prefixed, checksum-agnostic Ethereum address. */
export const addressSchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/, 'must be a 0x-prefixed 20-byte address')
  .transform((value) => value.toLowerCase() as `0x${string}`);

export const hexSignatureSchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{130}$/, 'must be a 65-byte hex signature');

export const txHashSchema = z.string().regex(/^0x[a-fA-F0-9]{64}$/, 'must be a 32-byte hash');

export const resourceIdSchema = z.enum(RESOURCE_IDS as [string, ...string[]]);
export const factionIdSchema = z.enum(FACTION_IDS as [string, ...string[]]);
export const stationAreaSchema = z.enum(
  [...STATION_AREA_IDS, 'corridor'] as unknown as [string, ...string[]],
);

export const itemKindSchema = z.enum(['resource', 'module', 'equipment', 'cosmetic']);

/** An identifier from the game-data catalogues. Deliberately narrow. */
export const defIdSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9_]+$/, 'must be a lowercase snake_case identifier');

export const positiveIntSchema = z.number().int().positive();
export const nonNegativeIntSchema = z.number().int().nonnegative();
export const finiteNumberSchema = z.number().finite();

export const vec3Schema = z.object({
  x: finiteNumberSchema,
  y: finiteNumberSchema,
  z: finiteNumberSchema,
});

export type Vec3Dto = z.infer<typeof vec3Schema>;

export const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().max(128).optional(),
});

/**
 * C0 and C1 control characters, which never belong in player-authored text.
 *
 * `no-control-regex` exists to catch these by accident. Here they are the whole
 * point: matching them is how they are kept out of chat and out of the logs.
 */
// eslint-disable-next-line no-control-regex
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f-\u009f]/u;

/**
 * Free text a player may send. Length-bounded and rejected outright if it
 * carries control characters, which are the usual vector for spoofing a chat
 * line or breaking a downstream log parser.
 */
export const playerTextSchema = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine((value) => !CONTROL_CHARACTERS.test(value), 'control characters are not allowed');

export const displayNameSchema = z
  .string()
  .trim()
  .min(3)
  .max(20)
  .regex(/^[A-Za-z0-9 _.-]+$/, 'letters, digits, spaces and . _ - only');

export const shipNameSchema = z
  .string()
  .trim()
  .min(2)
  .max(24)
  .regex(/^[A-Za-z0-9 '_.-]+$/, "letters, digits, spaces and ' . _ - only");
