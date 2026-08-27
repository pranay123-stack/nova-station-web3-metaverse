import Fastify from 'fastify';
import type { FastifyBaseLogger, FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import { GameError } from '@nova/shared';
import { GAME_DATA_VERSION } from '@nova/game-data';
import { corsOrigins, env } from './env.js';
import { logger } from './logger.js';
import { prisma } from './db/client.js';
import { loadSession } from './routes/context.js';
import { authRoutes } from './routes/auth.js';
import { playerRoutes } from './routes/player.js';
import { gameRoutes } from './routes/game.js';
import { marketRoutes } from './routes/market.js';
import { socialRoutes } from './routes/social.js';

/**
 * Builds the HTTP application.
 *
 * Kept separate from `index.ts` so tests can drive the whole API through
 * `app.inject()` without opening a port.
 */
export type NovaApp = FastifyInstance;

export async function buildApp(): Promise<NovaApp> {
  const config = env();

  const app = Fastify({
    // Fastify 5 takes an already-constructed pino instance as `loggerInstance`.
    loggerInstance: logger,
    trustProxy: true,
    bodyLimit: 64 * 1024,
  });

  await app.register(helmet, {
    // The API serves JSON only; the strict CSP belongs on the web app, which
    // has its own and needs to allow its own inline bootstrap.
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  });

  await app.register(cors, {
    origin: corsOrigins(),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  });

  await app.register(cookie);

  await app.register(rateLimit, {
    max: config.RATE_LIMIT_MAX,
    timeWindow: config.RATE_LIMIT_WINDOW_MS,
    // Rate limit by session where there is one, so several players behind one
    // NAT are not throttled as a single client.
    keyGenerator: (request) => {
      const user = request.sessionUser;
      return user ? `user:${user.userId}` : `ip:${request.ip}`;
    },
    errorResponseBuilder: () => ({
      error: { code: 'rate_limited', message: 'Too many requests. Slow down.' },
    }),
  });

  // The session is resolved once per request and reused by every handler.
  app.addHook('onRequest', loadSession);

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof GameError) {
      reply.code(error.status).send(error.toBody());
      return;
    }
    if ((error as { statusCode?: number }).statusCode === 429) {
      reply.code(429).send({ error: { code: 'rate_limited', message: 'Too many requests.' } });
      return;
    }
    request.log.error({ err: error }, 'unhandled error');
    const detail = error instanceof Error ? error.message : 'Something went wrong.';
    reply.code(500).send({
      error: {
        code: 'internal_error',
        // Internal messages are useful in development and are a disclosure risk
        // in production, so only the generic message ships.
        message: config.NODE_ENV === 'production' ? 'Something went wrong.' : detail,
      },
    });
  });

  app.setNotFoundHandler((request, reply) => {
    reply.code(404).send({ error: { code: 'not_found', message: 'No such endpoint.' } });
  });

  app.get('/health', async () => {
    let database = 'down';
    try {
      await prisma().$queryRaw`SELECT 1`;
      database = 'up';
    } catch {
      database = 'down';
    }
    return {
      status: database === 'up' ? 'ok' : 'degraded',
      database,
      version: GAME_DATA_VERSION,
      chainId: config.CHAIN_ID,
      uptimeSec: Math.round(process.uptime()),
    };
  });

  await app.register(authRoutes);
  await app.register(playerRoutes);
  await app.register(gameRoutes);
  await app.register(marketRoutes);
  await app.register(socialRoutes);

  // The concrete pino logger type is narrower than Fastify's own base logger
  // interface; the cast keeps the public signature stable for callers.
  return app as unknown as FastifyInstance & { log: FastifyBaseLogger };
}
