import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { privateKeyToAccount } from 'viem/accounts';
import { api, resetDatabase, signIn, testApp } from './helpers.js';
import { prisma } from '../src/db/client.js';

describe('authentication', () => {
  beforeAll(async () => {
    await testApp();
  });
  beforeEach(async () => {
    await resetDatabase();
  });

  it('issues a nonce bound to the requested address', async () => {
    const address = '0x1111111111111111111111111111111111111111';
    const { status, body } = await api<{ message: string; nonce: string }>(
      null,
      'POST',
      '/api/auth/nonce',
      { address },
    );
    expect(status).toBe(200);
    expect(body.message).toContain(address);
    expect(body.message).toContain(body.nonce);
  });

  it('rejects a nonce request for a malformed address', async () => {
    const { status } = await api(null, 'POST', '/api/auth/nonce', { address: 'not-an-address' });
    expect(status).toBe(400);
  });

  it('signs a player in and bootstraps their account', async () => {
    const player = await signIn(1);
    const db = prisma();

    const user = await db.user.findUniqueOrThrow({ where: { address: player.address } });
    expect(user.credits).toBeGreaterThan(0n);

    const ships = await db.ship.findMany({ where: { userId: user.id } });
    expect(ships).toHaveLength(1);
    expect(ships[0]?.active).toBe(true);

    const avatar = await db.avatar.findUnique({ where: { userId: user.id } });
    expect(avatar).not.toBeNull();

    const factions = await db.playerFaction.findMany({ where: { userId: user.id } });
    expect(factions).toHaveLength(3);
  });

  it('is idempotent: signing in twice does not duplicate the account', async () => {
    await signIn(2);
    await signIn(2);
    const users = await prisma().user.count();
    expect(users).toBe(1);
    const ships = await prisma().ship.count();
    expect(ships).toBe(1);
  });

  it('refuses to replay a used nonce', async () => {
    const server = await testApp();
    const account = privateKeyToAccount(`0x${'3'.repeat(64)}`);
    const address = account.address.toLowerCase();

    const nonce = await server.inject({
      method: 'POST',
      url: '/api/auth/nonce',
      payload: { address },
    });
    const { message } = nonce.json<{ message: string }>();
    const signature = await account.signMessage({ message });

    const first = await server.inject({
      method: 'POST',
      url: '/api/auth/verify',
      payload: { message, signature },
    });
    expect(first.statusCode).toBe(200);

    const replay = await server.inject({
      method: 'POST',
      url: '/api/auth/verify',
      payload: { message, signature },
    });
    expect(replay.statusCode).toBe(401);
  });

  it('refuses a signature from a different wallet', async () => {
    const server = await testApp();
    const victim = privateKeyToAccount(`0x${'4'.repeat(64)}`);
    const attacker = privateKeyToAccount(`0x${'5'.repeat(64)}`);

    const nonce = await server.inject({
      method: 'POST',
      url: '/api/auth/nonce',
      payload: { address: victim.address.toLowerCase() },
    });
    const { message } = nonce.json<{ message: string }>();
    const signature = await attacker.signMessage({ message });

    const response = await server.inject({
      method: 'POST',
      url: '/api/auth/verify',
      payload: { message, signature },
    });
    expect(response.statusCode).toBe(401);
  });

  it('refuses a message forged for another domain', async () => {
    const server = await testApp();
    const account = privateKeyToAccount(`0x${'6'.repeat(64)}`);
    const address = account.address.toLowerCase();

    const nonce = await server.inject({
      method: 'POST',
      url: '/api/auth/nonce',
      payload: { address },
    });
    const { message } = nonce.json<{ message: string }>();
    const forged = message.replace('localhost:3300 wants', 'evil.example wants');
    const signature = await account.signMessage({ message: forged });

    const response = await server.inject({
      method: 'POST',
      url: '/api/auth/verify',
      payload: { message: forged, signature },
    });
    expect(response.statusCode).toBe(401);
  });

  it('refuses a message forged for another chain', async () => {
    const server = await testApp();
    const account = privateKeyToAccount(`0x${'7'.repeat(64)}`);
    const address = account.address.toLowerCase();

    const nonce = await server.inject({
      method: 'POST',
      url: '/api/auth/nonce',
      payload: { address },
    });
    const { message } = nonce.json<{ message: string }>();
    const forged = message.replace('Chain ID: 31337', 'Chain ID: 1');
    const signature = await account.signMessage({ message: forged });

    const response = await server.inject({
      method: 'POST',
      url: '/api/auth/verify',
      payload: { message: forged, signature },
    });
    expect(response.statusCode).toBe(401);
  });

  it('refuses an invented nonce that was never issued', async () => {
    const server = await testApp();
    const account = privateKeyToAccount(`0x${'8'.repeat(64)}`);
    const address = account.address.toLowerCase();

    const nonce = await server.inject({
      method: 'POST',
      url: '/api/auth/nonce',
      payload: { address },
    });
    const { message, nonce: issued } = nonce.json<{ message: string; nonce: string }>();
    const forged = message.replace(issued, 'deadbeefdeadbeefdeadbeefdeadbeef');
    const signature = await account.signMessage({ message: forged });

    const response = await server.inject({
      method: 'POST',
      url: '/api/auth/verify',
      payload: { message: forged, signature },
    });
    expect(response.statusCode).toBe(401);
  });

  it('rejects every protected route without a session', async () => {
    for (const url of [
      '/api/player',
      '/api/inventory',
      '/api/ships',
      '/api/missions',
      '/api/crafting',
      '/api/chain/assets',
      '/api/social/friends',
    ]) {
      const { status } = await api(null, 'GET', url);
      expect(status, url).toBe(401);
    }
  });

  it('rejects a forged bearer token', async () => {
    const server = await testApp();
    const response = await server.inject({
      method: 'GET',
      url: '/api/player',
      headers: { authorization: 'Bearer aaa.bbb.ccc' },
    });
    expect(response.statusCode).toBe(401);
  });

  it('ends a session on logout', async () => {
    const player = await signIn(9);
    expect((await api(player, 'GET', '/api/player')).status).toBe(200);
    expect((await api(player, 'POST', '/api/auth/logout', {})).status).toBe(200);
    expect((await api(player, 'GET', '/api/player')).status).toBe(401);
  });

  it('answers the session probe without erroring when signed out', async () => {
    // A first page load asks "am I signed in?" — that must not be an error.
    const anonymous = await api<{ session: null; player: null }>(null, 'GET', '/api/auth/session');
    expect(anonymous.status).toBe(200);
    expect(anonymous.body.session).toBeNull();

    const player = await signIn(11);
    const signedIn = await api<{ session: { address: string } }>(
      player,
      'GET',
      '/api/auth/session',
    );
    expect(signedIn.status).toBe(200);
    expect(signedIn.body.session.address).toBe(player.address);
  });

  it('refuses a banned account', async () => {
    const player = await signIn(10);
    await prisma().user.update({
      where: { id: player.userId },
      data: { banned: true, banReason: 'testing' },
    });
    const { status } = await api(player, 'GET', '/api/player');
    expect(status).toBe(403);
  });
});
