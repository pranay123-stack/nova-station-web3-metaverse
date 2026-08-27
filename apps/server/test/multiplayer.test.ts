import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import type { FastifyInstance } from 'fastify';
import { MAX_FRAME_BYTES, type ServerMessage } from '@nova/shared';
import { SPAWN_POINT } from '@nova/game-data';
import { buildApp } from '../src/app.js';
import { createGateway, type GatewayHandle } from '../src/ws/gateway.js';
import { resetDatabase, signIn, testApp } from './helpers.js';

/**
 * These tests drive the realtime gateway over a real socket on a real port.
 *
 * Anything less would not exercise the parts that matter: the upgrade handshake,
 * the authentication check before a player is admitted, and the framing.
 */
let app: FastifyInstance;
let gateway: GatewayHandle;
let port: number;

/** Collects messages from a socket so a test can await the one it cares about. */
class Client {
  readonly messages: ServerMessage[] = [];
  closeCode: number | null = null;
  private constructor(readonly socket: WebSocket) {}

  static async connect(token: string | null): Promise<Client> {
    const url = `ws://127.0.0.1:${port}/ws${token ? `?token=${encodeURIComponent(token)}` : ''}`;
    const socket = new WebSocket(url);
    const client = new Client(socket);
    socket.on('message', (raw) => {
      client.messages.push(JSON.parse(raw.toString('utf8')) as ServerMessage);
    });
    socket.on('close', (code) => {
      client.closeCode = code;
    });
    await new Promise<void>((resolve, reject) => {
      socket.once('open', () => resolve());
      socket.once('close', (code) => reject(new Error(`closed before open: ${code}`)));
      socket.once('error', reject);
    });
    return client;
  }

  /** Resolves with the first message of a type, or rejects on timeout. */
  async waitFor<T extends ServerMessage['t']>(
    type: T,
    predicate: (message: Extract<ServerMessage, { t: T }>) => boolean = () => true,
    timeoutMs = 4000,
  ): Promise<Extract<ServerMessage, { t: T }>> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const found = this.messages.find(
        (message): message is Extract<ServerMessage, { t: T }> =>
          message.t === type && predicate(message as Extract<ServerMessage, { t: T }>),
      );
      if (found) return found;
      if (Date.now() > deadline) {
        throw new Error(`timed out waiting for "${type}"; saw: ${this.messages.map((m) => m.t).join(',')}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }

  send(payload: unknown): void {
    this.socket.send(typeof payload === 'string' ? payload : JSON.stringify(payload));
  }

  /** Resolves with the code the socket was closed with, waiting if necessary. */
  async closed(timeoutMs = 4000): Promise<number> {
    const deadline = Date.now() + timeoutMs;
    while (this.closeCode === null) {
      if (Date.now() > deadline) throw new Error('socket did not close');
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    return this.closeCode;
  }

  close(): void {
    if (this.socket.readyState === WebSocket.OPEN) this.socket.close();
  }
}

async function expectRejected(token: string | null): Promise<number> {
  const url = `ws://127.0.0.1:${port}/ws${token ? `?token=${token}` : ''}`;
  const socket = new WebSocket(url);
  return new Promise<number>((resolve, reject) => {
    socket.once('close', (code) => resolve(code));
    socket.once('error', () => resolve(-1));
    setTimeout(() => reject(new Error('connection was not closed')), 4000);
  });
}

describe('multiplayer gateway', () => {
  const open: Client[] = [];

  beforeAll(async () => {
    await testApp();
    app = await buildApp();
    await app.listen({ port: 0, host: '127.0.0.1' });
    const address = app.server.address();
    port = typeof address === 'object' && address ? address.port : 0;
    gateway = createGateway(app.server);
  });

  afterAll(async () => {
    for (const client of open) client.close();
    await gateway.close();
    await app.close();
  });

  beforeEach(async () => {
    // Close and let the server finish tearing the connections down before the
    // tables go away, or a late frame lands against a deleted account.
    for (const client of open.splice(0)) client.close();
    await new Promise((resolve) => setTimeout(resolve, 250));
    await resetDatabase();
  });

  it('refuses a connection with no session', async () => {
    expect(await expectRejected(null)).toBe(4401);
  });

  it('refuses a connection with a forged token', async () => {
    expect(await expectRejected('aaa.bbb.ccc')).toBe(4401);
  });

  it('admits an authenticated player and sends a welcome', async () => {
    const player = await signIn(81);
    const client = await Client.connect(player.token);
    open.push(client);

    const welcome = await client.waitFor('welcome');
    expect(welcome.selfId).toBeTruthy();
    expect(welcome.snapshotHz).toBeGreaterThan(0);
    expect(welcome.spawn.x).toBeCloseTo(SPAWN_POINT[0]);
    expect(welcome.spawn.z).toBeCloseTo(SPAWN_POINT[2]);
  });

  it('tells existing players when someone joins, and when they leave', async () => {
    const first = await signIn(82);
    const second = await signIn(83);

    const clientA = await Client.connect(first.token);
    open.push(clientA);
    await clientA.waitFor('welcome');

    const clientB = await Client.connect(second.token);
    open.push(clientB);
    const join = await clientA.waitFor('join');
    expect(join.player.address).toBe(second.address);

    clientB.close();
    await clientA.waitFor('leave');
  });

  it('broadcasts snapshots containing nearby players', async () => {
    const first = await signIn(84);
    const second = await signIn(85);
    const clientA = await Client.connect(first.token);
    const clientB = await Client.connect(second.token);
    open.push(clientA, clientB);
    await clientA.waitFor('welcome');
    const welcomeB = await clientB.waitFor('welcome');

    // Both spawn together, so each should see the other immediately.
    const snapshot = await clientA.waitFor('snapshot', (message) => message.players.length > 0);
    expect(snapshot.players.some((entry) => entry.id === welcomeB.selfId)).toBe(true);
  });

  it('leaves distant players out of a snapshot', async () => {
    const first = await signIn(86);
    const second = await signIn(87);
    const clientA = await Client.connect(first.token);
    const clientB = await Client.connect(second.token);
    open.push(clientA, clientB);
    await clientA.waitFor('welcome');
    const welcomeB = await clientB.waitFor('welcome');

    // Walk B south down the corridor into the Mining Bay, at a pace the
    // server's own speed check accepts. Straight-line distance from spawn ends
    // up beyond the 70m interest radius.
    let z = SPAWN_POINT[2];
    for (let step = 0; step < 50 && z < 88; step += 1) {
      z += 1.6;
      clientB.send({ t: 'move', p: { x: 0, y: 0, z }, y: 0, s: 'run', ts: Date.now() });
      await new Promise((resolve) => setTimeout(resolve, 110));
    }
    expect(z).toBeGreaterThan(80);

    // A real client applies corrections rather than ignoring them; without
    // that it would desync permanently after a single rejected step.
    expect(clientB.messages.filter((m) => m.t === 'correction')).toHaveLength(0);

    clientA.messages.length = 0;
    await new Promise((resolve) => setTimeout(resolve, 400));
    const snapshots = clientA.messages.filter((message) => message.t === 'snapshot');
    const stillVisible = snapshots.some(
      (message) =>
        message.t === 'snapshot' && message.players.some((entry) => entry.id === welcomeB.selfId),
    );
    expect(stillVisible).toBe(false);
  });

  it('corrects a teleport instead of accepting it', async () => {
    const player = await signIn(88);
    const client = await Client.connect(player.token);
    open.push(client);
    await client.waitFor('welcome');

    client.send({ t: 'move', p: { x: 0, y: 7, z: -140 }, y: 0, s: 'walk', ts: Date.now() });
    const correction = await client.waitFor('correction');
    expect(correction.reason).toBeTruthy();
    // The server holds the player where they legitimately were.
    expect(correction.p.z).toBeCloseTo(SPAWN_POINT[2], 1);
  });

  it('corrects a walk into a wall', async () => {
    const player = await signIn(89);
    const client = await Client.connect(player.token);
    open.push(client);
    await client.waitFor('welcome');

    // Step inside the habitat west wall.
    for (let step = 0; step < 40; step += 1) {
      client.send({
        t: 'move',
        p: { x: -0.8 * step, y: 0, z: 14 },
        y: 0,
        s: 'run',
        ts: Date.now(),
      });
      await new Promise((resolve) => setTimeout(resolve, 15));
    }
    const correction = await client.waitFor('correction');
    expect(correction.p.x).toBeGreaterThan(-24);
  });

  it('accepts an ordinary walk without correcting it', async () => {
    const player = await signIn(90);
    const client = await Client.connect(player.token);
    open.push(client);
    await client.waitFor('welcome');

    let z = SPAWN_POINT[2];
    for (let step = 0; step < 10; step += 1) {
      z -= 0.4;
      client.send({ t: 'move', p: { x: 0, y: 0, z }, y: 0, s: 'walk', ts: Date.now() });
      await new Promise((resolve) => setTimeout(resolve, 60));
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(client.messages.some((message) => message.t === 'correction')).toBe(false);
  });

  it('answers a ping with a pong carrying the client timestamp', async () => {
    const player = await signIn(91);
    const client = await Client.connect(player.token);
    open.push(client);
    await client.waitFor('welcome');

    const stamp = Date.now();
    client.send({ t: 'ping', ts: stamp });
    const pong = await client.waitFor('pong');
    expect(pong.ts).toBe(stamp);
    expect(pong.server).toBeGreaterThan(0);
  });

  it('delivers station chat to everyone and stores it', async () => {
    const first = await signIn(92);
    const second = await signIn(93);
    const clientA = await Client.connect(first.token);
    const clientB = await Client.connect(second.token);
    open.push(clientA, clientB);
    await clientA.waitFor('welcome');
    await clientB.waitFor('welcome');

    clientA.send({ t: 'chat', c: 'station', m: 'docking in five' });
    const received = await clientB.waitFor('chat');
    expect(received.m).toBe('docking in five');
    expect(received.address).toBe(first.address);

    const history = await (
      await testApp()
    ).inject({
      method: 'GET',
      url: '/api/social/chat',
      headers: { authorization: `Bearer ${second.token}` },
    });
    expect(history.json<{ messages: { text: string }[] }>().messages.at(-1)?.text).toBe(
      'docking in five',
    );
  });

  it('rejects a malformed frame without dropping the connection', async () => {
    const player = await signIn(94);
    const client = await Client.connect(player.token);
    open.push(client);
    await client.waitFor('welcome');

    client.send('not json at all');
    const error = await client.waitFor('error');
    expect(error.code).toBe('validation_failed');
    expect(client.socket.readyState).toBe(WebSocket.OPEN);
  });

  it('ignores an unknown message type', async () => {
    const player = await signIn(95);
    const client = await Client.connect(player.token);
    open.push(client);
    await client.waitFor('welcome');

    client.send({ t: 'grant_credits', amount: 1_000_000 });
    const error = await client.waitFor('error');
    expect(error.code).toBe('validation_failed');
  });

  it('rejects an oversized frame', async () => {
    const player = await signIn(96);
    const client = await Client.connect(player.token);
    open.push(client);
    await client.waitFor('welcome');

    client.send({ t: 'chat', c: 'station', m: 'x'.repeat(MAX_FRAME_BYTES) });
    // Either the frame is refused by the server's max payload (closing the
    // socket) or it is rejected by the decoder. Both are acceptable outcomes;
    // silently accepting it is not.
    const outcome = await Promise.race([
      client.waitFor('error').then(() => 'error' as const),
      client.closed().then(() => 'closed' as const),
    ]);
    expect(['error', 'closed']).toContain(outcome);
  });

  it('rate-limits a client that floods chat', async () => {
    const player = await signIn(97);
    const client = await Client.connect(player.token);
    open.push(client);
    await client.waitFor('welcome');

    for (let i = 0; i < 25; i += 1) {
      client.send({ t: 'chat', c: 'station', m: `spam ${i}` });
    }
    const error = await client.waitFor('error', (message) => message.code === 'rate_limited');
    expect(error.code).toBe('rate_limited');
  });

  it('replaces an earlier session for the same account', async () => {
    const player = await signIn(98);
    const first = await Client.connect(player.token);
    open.push(first);
    await first.waitFor('welcome');

    const second = await Client.connect(player.token);
    open.push(second);
    await second.waitFor('welcome');

    // One account occupies one body: the older connection is closed.
    const code = await first.closed();
    expect(code).toBe(4001);
  });

  it('records a play session for the connection', async () => {
    const player = await signIn(99);
    const client = await Client.connect(player.token);
    open.push(client);
    await client.waitFor('welcome');
    client.close();
    await new Promise((resolve) => setTimeout(resolve, 300));

    const { prisma } = await import('../src/db/client.js');
    const sessions = await prisma().playerSession.count({ where: { userId: player.userId } });
    expect(sessions).toBeGreaterThan(0);
  });
});
