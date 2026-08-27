import type { FastifyInstance } from 'fastify';
import { GameError, nonceRequestSchema, siweVerifySchema } from '@nova/shared';
import { issueChallenge, verifyChallenge } from '../auth/siwe.js';
import {
  SESSION_COOKIE,
  cookieOptions,
  createSession,
  revokeSession,
} from '../auth/session.js';
import { prisma } from '../db/client.js';
import { env } from '../env.js';
import { claimDailyStipend, ensurePlayer, playerDto } from '../services/player.js';
import { parse, readToken } from './context.js';

export async function authRoutes(app: FastifyInstance): Promise<void> {
  /**
   * Issues a SIWE challenge.
   *
   * Rate-limited harder than the rest of the API: this is the one unauthenticated
   * endpoint that writes to the database.
   */
  app.post(
    '/api/auth/nonce',
    { config: { rateLimit: { max: env().AUTH_RATE_LIMIT_MAX, timeWindow: '1 minute' } } },
    async (request) => {
      const { address } = parse(nonceRequestSchema, request.body);
      const challenge = await issueChallenge(prisma(), address);
      return {
        nonce: challenge.nonce,
        message: challenge.message,
        expiresAt: challenge.expiresAt.toISOString(),
      };
    },
  );

  /** Verifies a signature and opens a session. */
  app.post(
    '/api/auth/verify',
    { config: { rateLimit: { max: env().AUTH_RATE_LIMIT_MAX, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const body = parse(siweVerifySchema, request.body);
      const db = prisma();
      const login = await verifyChallenge(db, body.message, body.signature as `0x${string}`);

      const userId = await ensurePlayer(db, login.address);
      const user = await db.user.findUniqueOrThrow({
        where: { id: userId },
        select: { banned: true, banReason: true },
      });
      if (user.banned) {
        throw new GameError('forbidden', user.banReason ?? 'This account is suspended.');
      }

      const session = await createSession(db, userId, {
        ip: request.ip,
        userAgent: request.headers['user-agent'],
      });
      const stipend = await claimDailyStipend(db, userId);

      reply.setCookie(SESSION_COOKIE, session.token, cookieOptions(session.expiresAt));
      return {
        // Returned as well as set, so a non-browser client can use the API.
        token: session.token,
        session: {
          address: login.address,
          issuedAt: new Date().toISOString(),
          expiresAt: session.expiresAt.toISOString(),
          chainId: env().CHAIN_ID,
        },
        stipend,
        player: await playerDto(db, userId),
      };
    },
  );

  /**
   * Reports the live session, if any.
   *
   * Deliberately a 200 with a null session rather than a 401: "am I signed in?"
   * is a question, not an authorisation failure, and answering it with an error
   * status makes every first page load log a failed request in the console.
   */
  app.get('/api/auth/session', async (request) => {
    const user = request.sessionUser;
    if (!user || user.banned) {
      return { session: null, player: null };
    }
    return {
      session: {
        address: user.address,
        issuedAt: new Date().toISOString(),
        expiresAt: new Date().toISOString(),
        chainId: env().CHAIN_ID,
      },
      player: await playerDto(prisma(), user.userId),
    };
  });

  app.post('/api/auth/logout', async (request, reply) => {
    await revokeSession(prisma(), readToken(request));
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return { ok: true };
  });
}
