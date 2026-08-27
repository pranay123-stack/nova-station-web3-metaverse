import type { Server as HttpServer, IncomingMessage } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import {
  HEARTBEAT_INTERVAL_MS,
  IDLE_TIMEOUT_MS,
  SNAPSHOT_HZ,
  WS_PROTOCOL_VERSION,
  decodeClientMessage,
  type ClientMessage,
  type PlayerIdentity,
} from '@nova/shared';
import {
  SPAWN_POINT,
  SPAWN_YAW,
  areaAtPosition,
  getStationGeometry,
  type StationAreaId,
} from '@nova/game-data';
import {
  DEFAULT_CHARACTER_PARAMS,
  createCollisionWorld,
  validateMovement,
} from '@nova/game-engine';
import { logger } from '../logger.js';
import { prisma } from '../db/client.js';
import { resolveSession } from '../auth/session.js';
import { SESSION_COOKIE } from '../auth/session.js';
import { randomToken } from '../lib/ids.js';
import { saveChat } from '../services/social.js';
import { MessageRateLimiter } from './rate-limit.js';
import { Room, type ConnectedPlayer } from './room.js';

const world = createCollisionWorld(getStationGeometry());
const params = DEFAULT_CHARACTER_PARAMS;

/** How often accumulated walking distance is written to the database. */
const DISTANCE_FLUSH_MS = 30_000;
/** Corrections tolerated before a client is disconnected as broken or hostile. */
const MAX_CORRECTIONS = 60;

export interface GatewayHandle {
  readonly room: Room;
  close(): Promise<void>;
}

/**
 * The realtime gateway.
 *
 * Movement here is *soft* authoritative. The client simulates locally so that
 * walking feels immediate, and the server re-checks every reported position
 * against the same collision geometry the client used. A position that is
 * unreachable, inside a wall, or outside the station is corrected and the client
 * is told; enough corrections and the connection is closed.
 *
 * Nothing of value is granted over this socket. Movement earns no resources, so
 * the worst a perfect movement cheat achieves is standing somewhere odd.
 */
export function createGateway(server: HttpServer): GatewayHandle {
  const room = new Room();
  const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 4096 });

  const limiters = new WeakMap<WebSocket, MessageRateLimiter>();

  wss.on('connection', (socket: WebSocket, request: IncomingMessage) => {
    void handleConnection(room, limiters, socket, request);
  });

  const snapshotTimer = setInterval(() => {
    for (const player of room.all()) {
      room.send(player, {
        t: 'snapshot',
        ts: Date.now(),
        players: room.snapshotFor(player),
      });
    }
  }, 1000 / SNAPSHOT_HZ);

  const presenceTimer = setInterval(() => {
    room.broadcast({ t: 'presence', count: room.size(), areas: room.areaCounts() });
  }, 5000);

  const heartbeatTimer = setInterval(() => {
    const now = Date.now();
    for (const player of room.all()) {
      if (now - player.lastSeenAt > IDLE_TIMEOUT_MS) {
        logger.debug({ id: player.id }, 'closing idle connection');
        player.socket.close(4002, 'Idle');
        continue;
      }
      if (player.socket.readyState === 1) player.socket.ping();
    }
  }, HEARTBEAT_INTERVAL_MS);

  const distanceTimer = setInterval(() => {
    void flushDistances(room);
  }, DISTANCE_FLUSH_MS);

  return {
    room,
    async close() {
      clearInterval(snapshotTimer);
      clearInterval(presenceTimer);
      clearInterval(heartbeatTimer);
      clearInterval(distanceTimer);
      await flushDistances(room);
      for (const player of room.all()) {
        player.socket.close(1001, 'Server shutting down');
      }
      await new Promise<void>((resolve) => wss.close(() => resolve()));
    },
  };
}

function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return undefined;
}

async function handleConnection(
  room: Room,
  limiters: WeakMap<WebSocket, MessageRateLimiter>,
  socket: WebSocket,
  request: IncomingMessage,
): Promise<void> {
  const db = prisma();
  const url = new URL(request.url ?? '/ws', 'http://localhost');
  const token =
    readCookie(request.headers.cookie, SESSION_COOKIE) ?? url.searchParams.get('token') ?? undefined;

  const session = await resolveSession(db, token);
  if (!session) {
    socket.close(4401, 'Not authenticated');
    return;
  }
  if (session.banned) {
    socket.close(4403, 'Account suspended');
    return;
  }

  const profile = await db.user.findUnique({
    where: { id: session.userId },
    select: {
      displayName: true,
      level: true,
      primaryFaction: true,
      avatar: true,
    },
  });
  if (!profile) {
    socket.close(4404, 'Player not found');
    return;
  }

  const identity: PlayerIdentity = {
    id: randomToken(8),
    address: session.address,
    name: profile.displayName,
    level: profile.level,
    faction: profile.primaryFaction,
    title: '',
    avatar: {
      suitId: profile.avatar?.suitId ?? 'suit_standard',
      helmetId: profile.avatar?.helmetId ?? 'helmet_standard',
      suitPattern: profile.avatar?.suitPattern ?? 'pattern_plain',
      visor: profile.avatar?.visor ?? 'visor_ice',
      emblem: profile.avatar?.emblem ?? 'emblem_federation',
      accessory: profile.avatar?.accessory ?? 'accessory_pack',
      primaryColor: profile.avatar?.primaryColor ?? '#38bdf8',
      secondaryColor: profile.avatar?.secondaryColor ?? '#0f172a',
    },
  };

  const player: ConnectedPlayer = {
    id: identity.id,
    userId: session.userId,
    address: session.address,
    socket,
    identity,
    x: SPAWN_POINT[0],
    y: SPAWN_POINT[1],
    z: SPAWN_POINT[2],
    yaw: SPAWN_YAW,
    state: 'idle',
    area: 'habitat',
    pendingDistance: 0,
    // The first position report has no previous sample to be measured against.
    // Backdating the baseline by a second gives it a full second of travel
    // budget, so a client that moved between connecting and its first update is
    // not corrected for it.
    lastMoveAt: Date.now() - 1000,
    lastSeenAt: Date.now(),
    correctionCount: 0,
    alive: true,
  };

  limiters.set(socket, new MessageRateLimiter());
  room.add(player);

  room.send(player, {
    t: 'welcome',
    v: WS_PROTOCOL_VERSION,
    selfId: player.id,
    snapshotHz: SNAPSHOT_HZ,
    players: room.identities().filter((entry) => entry.id !== player.id),
    spawn: { x: player.x, y: player.y, z: player.z, yaw: player.yaw },
  });
  room.broadcast({ t: 'join', player: identity }, player.id);

  const playSession = await db.playerSession.create({
    data: { userId: session.userId, ip: request.socket.remoteAddress ?? null },
    select: { id: true, startedAt: true },
  });

  socket.on('pong', () => {
    player.lastSeenAt = Date.now();
  });

  socket.on('message', (raw) => {
    player.lastSeenAt = Date.now();
    const text = typeof raw === 'string' ? raw : raw.toString('utf8');
    const message = decodeClientMessage(text);
    if (!message) {
      room.send(player, { t: 'error', code: 'validation_failed', m: 'Malformed frame.' });
      return;
    }

    const limiter = limiters.get(socket);
    if (limiter && !limiter.allow(message.t)) {
      room.send(player, { t: 'error', code: 'rate_limited', m: 'Slow down.' });
      if (limiter.shouldDisconnect()) {
        logger.warn({ id: player.id, address: player.address }, 'disconnecting rate-limit abuser');
        socket.close(4029, 'Rate limit exceeded');
      }
      return;
    }

    // Fire-and-forget, but never unhandled: a failed database write on a chat
    // line must not become an unhandled rejection that takes the process down.
    void handleMessage(room, player, message).catch((error: unknown) => {
      logger.error({ err: error, id: player.id, type: message.t }, 'failed to handle frame');
      room.send(player, { t: 'error', code: 'internal_error', m: 'That did not go through.' });
    });
  });

  socket.on('close', () => {
    void (async () => {
      room.remove(player.id);
      room.broadcast({ t: 'leave', id: player.id });
      try {
        const durationSec = Math.max(
          0,
          Math.round((Date.now() - playSession.startedAt.getTime()) / 1000),
        );
        // `updateMany` rather than `update`: the row may legitimately be gone
        // by the time a socket closes — pruned by a cleanup job, or dropped
        // between tests — and a disconnect is not the place to raise about it.
        await db.playerSession.updateMany({
          where: { id: playSession.id },
          data: { endedAt: new Date(), durationSec },
        });
        await db.user.updateMany({
          where: { id: player.userId },
          data: {
            lastSeenAt: new Date(),
            playtimeSec: { increment: Math.min(durationSec, 86_400) },
            distanceWalked: { increment: Math.round(player.pendingDistance) },
          },
        });
      } catch (error) {
        logger.error({ err: error }, 'failed to close play session');
      }
    })();
  });

  socket.on('error', (error) => {
    logger.debug({ err: error, id: player.id }, 'socket error');
  });
}

async function handleMessage(
  room: Room,
  player: ConnectedPlayer,
  message: ClientMessage,
): Promise<void> {
  switch (message.t) {
    case 'move':
      handleMove(room, player, message);
      return;

    case 'emote':
      room.broadcastNear(player, { t: 'emote', id: player.id, e: message.e }, true);
      return;

    case 'area': {
      player.area = message.a as StationAreaId;
      return;
    }

    case 'ping':
      room.send(player, { t: 'pong', ts: message.ts, server: Date.now() });
      return;

    case 'chat':
      await handleChat(room, player, message);
      return;

    default:
      return;
  }
}

function handleMove(
  room: Room,
  player: ConnectedPlayer,
  message: Extract<ClientMessage, { t: 'move' }>,
): void {
  const now = Date.now();
  const dt = Math.max(0.016, Math.min(2, (now - player.lastMoveAt) / 1000));
  player.lastMoveAt = now;

  const check = validateMovement(
    { x: player.x, y: player.y, z: player.z },
    { x: message.p.x, y: message.p.y, z: message.p.z },
    dt,
    params,
    world,
  );

  if (check.verdict === 'accepted') {
    const dx = check.position.x - player.x;
    const dz = check.position.z - player.z;
    player.pendingDistance += Math.hypot(dx, dz);
    player.x = check.position.x;
    player.y = check.position.y;
    player.z = check.position.z;
    player.yaw = message.y;
    player.state = message.s;
    player.area = areaAtPosition(player.x, player.z);
    return;
  }

  player.correctionCount += 1;
  room.send(player, {
    t: 'correction',
    p: { x: player.x, y: player.y, z: player.z },
    reason: check.reason ?? 'invalid move',
  });

  if (player.correctionCount > MAX_CORRECTIONS) {
    logger.warn(
      { id: player.id, address: player.address, reason: check.reason },
      'disconnecting client after repeated movement corrections',
    );
    player.socket.close(4030, 'Movement validation failed');
  }
}

async function handleChat(
  room: Room,
  player: ConnectedPlayer,
  message: Extract<ClientMessage, { t: 'chat' }>,
): Promise<void> {
  const db = prisma();
  const payload = {
    t: 'chat' as const,
    id: player.id,
    name: player.identity.name,
    address: player.address,
    c: message.c,
    m: message.m,
    ts: Date.now(),
  };

  if (message.c === 'direct') {
    if (!message.to) return;
    const target = room.byAddress(message.to);
    if (!target) {
      room.send(player, { t: 'notice', level: 'warn', m: 'That commander is not on the station.' });
      return;
    }
    await saveChat(db, player.userId, 'direct', message.m, { toUserId: target.userId });
    room.send(target, payload);
    room.send(player, payload);
    return;
  }

  if (message.c === 'area') {
    await saveChat(db, player.userId, 'area', message.m, { area: player.area });
    room.broadcastArea(player.area, payload);
    return;
  }

  await saveChat(db, player.userId, 'station', message.m);
  room.broadcast(payload);
}

/** Writes accumulated walking distance so achievements can see it. */
async function flushDistances(room: Room): Promise<void> {
  const db = prisma();
  for (const player of room.all()) {
    const metres = Math.round(player.pendingDistance);
    if (metres < 1) continue;
    player.pendingDistance -= metres;
    try {
      await db.user.updateMany({
        where: { id: player.userId },
        data: { distanceWalked: { increment: metres }, lastSeenAt: new Date() },
      });
    } catch (error) {
      logger.debug({ err: error }, 'failed to flush walked distance');
    }
  }
}
