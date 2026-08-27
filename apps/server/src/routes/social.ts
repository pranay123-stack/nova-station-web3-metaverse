import type { FastifyInstance } from 'fastify';
import { chatSendSchema, friendActionSchema, friendRequestSchema, removeFriendSchema } from '@nova/shared';
import { prisma } from '../db/client.js';
import { auth, parse } from './context.js';
import {
  listFriends,
  listRequests,
  recentChat,
  removeFriend,
  requestFriend,
  respondToRequest,
} from '../services/social.js';

export async function socialRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/social/friends', async (request) => {
    const user = auth(request);
    const db = prisma();
    const [friends, requests] = await Promise.all([
      listFriends(db, user.userId),
      listRequests(db, user.userId),
    ]);
    return { friends, requests };
  });

  app.post('/api/social/friends/request', async (request) => {
    const user = auth(request);
    const body = parse(friendRequestSchema, request.body);
    await requestFriend(prisma(), user.userId, body.address);
    return { ok: true };
  });

  app.post('/api/social/friends/respond', async (request) => {
    const user = auth(request);
    const body = parse(friendActionSchema, request.body);
    await respondToRequest(prisma(), user.userId, body.requestId, body.action);
    return { ok: true };
  });

  app.post('/api/social/friends/remove', async (request) => {
    const user = auth(request);
    const body = parse(removeFriendSchema, request.body);
    await removeFriend(prisma(), user.userId, body.address);
    return { ok: true };
  });

  /** Recent station chat, so a joining player sees context rather than silence. */
  app.get('/api/social/chat', async (request) => {
    auth(request);
    return { messages: await recentChat(prisma(), 'station', 40) };
  });

  /**
   * Chat is delivered over the WebSocket; this endpoint exists only so the
   * schema is validated identically for clients that cannot hold a socket open.
   */
  app.post('/api/social/chat', async (request) => {
    auth(request);
    parse(chatSendSchema, request.body);
    return { ok: true, delivered: false, note: 'Send chat over the game socket for live delivery.' };
  });

  app.get('/api/social/online', async (request) => {
    auth(request);
    const since = new Date(Date.now() - 2 * 60 * 1000);
    const rows = await prisma().user.findMany({
      where: { lastSeenAt: { gte: since } },
      orderBy: { lastSeenAt: 'desc' },
      take: 50,
      select: { address: true, displayName: true, level: true, primaryFaction: true },
    });
    return { online: rows };
  });
}
