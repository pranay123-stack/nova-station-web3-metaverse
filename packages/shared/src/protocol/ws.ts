import { z } from 'zod';
import { addressSchema, playerTextSchema, stationAreaSchema, vec3Schema } from './common.js';

/**
 * Realtime protocol.
 *
 * Wire format is JSON: every message is `{ t: <type>, ... }`. JSON costs a few
 * bytes over a packed binary encoding, and buys the ability to read a live
 * session in browser devtools — a trade worth making at this scale. The
 * snapshot rate (10 Hz) and quantised positions do far more for bandwidth than
 * the encoding would; see MULTIPLAYER.md for the measurements.
 */
export const WS_PROTOCOL_VERSION = 1;

/** Server broadcast rate. Clients interpolate between snapshots. */
export const SNAPSHOT_HZ = 10;
/** Rate at which a client reports its own position. */
export const INPUT_HZ = 10;
/** Players beyond this distance are not included in a snapshot. */
export const INTEREST_RADIUS = 70;
/** A connection with no traffic for this long is closed. */
export const IDLE_TIMEOUT_MS = 60_000;
/** Clients must answer a ping within this window. */
export const HEARTBEAT_INTERVAL_MS = 15_000;

export const EMOTES = ['wave', 'salute', 'cheer', 'point', 'sit', 'dance'] as const;
export type Emote = (typeof EMOTES)[number];

export const MOVEMENT_STATES = ['idle', 'walk', 'run', 'jump', 'fall'] as const;
export type MovementState = (typeof MOVEMENT_STATES)[number];

/* ------------------------------------------------------- client → server */

export const clientMoveSchema = z.object({
  t: z.literal('move'),
  p: vec3Schema,
  /** Facing, radians. */
  y: z.number().finite(),
  s: z.enum(MOVEMENT_STATES),
  /** Client timestamp in ms, echoed back for latency measurement. */
  ts: z.number().finite(),
});

export const clientEmoteSchema = z.object({
  t: z.literal('emote'),
  e: z.enum(EMOTES),
});

export const clientChatSchema = z.object({
  t: z.literal('chat'),
  c: z.enum(['station', 'area', 'direct']),
  to: addressSchema.optional(),
  m: playerTextSchema(240),
});

export const clientAreaSchema = z.object({
  t: z.literal('area'),
  a: stationAreaSchema,
});

export const clientPingSchema = z.object({
  t: z.literal('ping'),
  ts: z.number().finite(),
});

export const clientMessageSchema = z.discriminatedUnion('t', [
  clientMoveSchema,
  clientEmoteSchema,
  clientChatSchema,
  clientAreaSchema,
  clientPingSchema,
]);

export type ClientMessage = z.infer<typeof clientMessageSchema>;
export type ClientMessageType = ClientMessage['t'];

/**
 * Per-message-type budgets, enforced by the gateway with a token bucket.
 * A client that exceeds one is warned, then disconnected — see SECURITY.md.
 */
export const CLIENT_RATE_LIMITS: Readonly<
  Record<ClientMessageType, { readonly perSecond: number; readonly burst: number }>
> = {
  move: { perSecond: 15, burst: 30 },
  emote: { perSecond: 2, burst: 4 },
  chat: { perSecond: 1, burst: 5 },
  area: { perSecond: 2, burst: 6 },
  ping: { perSecond: 2, burst: 4 },
};

/** Hard cap on a single inbound frame, before parsing. */
export const MAX_FRAME_BYTES = 2048;

/* ------------------------------------------------------- server → client */

export interface PlayerSnapshot {
  /** Short session id, not the wallet address. */
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly yaw: number;
  readonly s: MovementState;
}

export interface PlayerIdentity {
  readonly id: string;
  readonly address: string;
  readonly name: string;
  readonly level: number;
  readonly faction: string | null;
  readonly title: string;
  readonly avatar: {
    readonly suitId: string;
    readonly helmetId: string;
    readonly suitPattern: string;
    readonly visor: string;
    readonly emblem: string;
    readonly accessory: string;
    readonly primaryColor: string;
    readonly secondaryColor: string;
  };
}

export type ServerMessage =
  | {
      t: 'welcome';
      v: number;
      selfId: string;
      snapshotHz: number;
      players: readonly PlayerIdentity[];
      spawn: { x: number; y: number; z: number; yaw: number };
    }
  | { t: 'snapshot'; ts: number; players: readonly PlayerSnapshot[] }
  | { t: 'join'; player: PlayerIdentity }
  | { t: 'leave'; id: string }
  | { t: 'emote'; id: string; e: Emote }
  | {
      t: 'chat';
      id: string;
      name: string;
      address: string;
      c: 'station' | 'area' | 'direct';
      m: string;
      ts: number;
    }
  | { t: 'correction'; p: { x: number; y: number; z: number }; reason: string }
  | { t: 'pong'; ts: number; server: number }
  | { t: 'notice'; level: 'info' | 'warn' | 'error'; m: string }
  | { t: 'presence'; count: number; areas: Readonly<Record<string, number>> }
  | { t: 'error'; code: string; m: string };

export type ServerMessageType = ServerMessage['t'];

/** Positions are sent to centimetre precision; angles to a milliradian. */
export const quantisePosition = (value: number): number => Math.round(value * 100) / 100;
export const quantiseAngle = (value: number): number => Math.round(value * 1000) / 1000;

export function encode(message: ServerMessage): string {
  return JSON.stringify(message);
}

/** Parses and validates one inbound frame. Returns null for anything invalid. */
export function decodeClientMessage(raw: string): ClientMessage | null {
  if (raw.length > MAX_FRAME_BYTES) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  const result = clientMessageSchema.safeParse(parsed);
  return result.success ? result.data : null;
}
