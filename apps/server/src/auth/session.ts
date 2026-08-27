import { createHmac, timingSafeEqual } from 'node:crypto';
import { GameError } from '@nova/shared';
import { env } from '../env.js';
import { randomToken, sha256 } from '../lib/ids.js';
import type { Db } from '../db/client.js';

/**
 * Session tokens.
 *
 * A token is `<id>.<secret>.<hmac>`. The HMAC lets the server reject a forged
 * token without a database round trip; only the SHA-256 of the whole token is
 * stored, so a leaked database yields no usable sessions.
 */
export const SESSION_COOKIE = 'nova_session';

interface TokenParts {
  readonly id: string;
  readonly secret: string;
}

function sign(id: string, secret: string): string {
  return createHmac('sha256', env().SESSION_SECRET).update(`${id}.${secret}`).digest('base64url');
}

function buildToken(parts: TokenParts): string {
  return `${parts.id}.${parts.secret}.${sign(parts.id, parts.secret)}`;
}

function parseToken(token: string): TokenParts | null {
  const segments = token.split('.');
  if (segments.length !== 3) return null;
  const [id, secret, mac] = segments;
  if (!id || !secret || !mac) return null;

  const expected = Buffer.from(sign(id, secret));
  const received = Buffer.from(mac);
  if (expected.length !== received.length) return null;
  if (!timingSafeEqual(expected, received)) return null;

  return { id, secret };
}

export interface IssuedSession {
  readonly token: string;
  readonly expiresAt: Date;
}

export async function createSession(
  db: Db,
  userId: string,
  meta: { ip?: string; userAgent?: string },
): Promise<IssuedSession> {
  const config = env();
  const id = randomToken(12);
  const secret = randomToken(32);
  const token = buildToken({ id, secret });
  const expiresAt = new Date(Date.now() + config.SESSION_TTL_HOURS * 60 * 60 * 1000);

  await db.session.create({
    data: {
      userId,
      tokenHash: sha256(token),
      expiresAt,
      ip: meta.ip ?? null,
      userAgent: meta.userAgent?.slice(0, 256) ?? null,
    },
  });

  return { token, expiresAt };
}

export interface SessionUser {
  readonly userId: string;
  readonly address: string;
  readonly sessionId: string;
  readonly banned: boolean;
}

export async function resolveSession(db: Db, token: string | undefined): Promise<SessionUser | null> {
  if (!token) return null;
  if (!parseToken(token)) return null;

  const session = await db.session.findUnique({
    where: { tokenHash: sha256(token) },
    select: {
      id: true,
      expiresAt: true,
      revokedAt: true,
      user: { select: { id: true, address: true, banned: true } },
    },
  });

  if (!session || session.revokedAt) return null;
  if (session.expiresAt.getTime() <= Date.now()) return null;

  return {
    userId: session.user.id,
    address: session.user.address,
    sessionId: session.id,
    banned: session.user.banned,
  };
}

export async function revokeSession(db: Db, token: string | undefined): Promise<void> {
  if (!token) return;
  await db.session.updateMany({
    where: { tokenHash: sha256(token), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function revokeAllSessions(db: Db, userId: string): Promise<void> {
  await db.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
}

export async function pruneSessions(db: Db): Promise<number> {
  const result = await db.session.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  return result.count;
}

/** Throws when a request has no live session, or the account is banned. */
export function requireUser(user: SessionUser | null): SessionUser {
  if (!user) throw new GameError('unauthorized', 'Sign in to continue.');
  if (user.banned) throw new GameError('forbidden', 'This account is suspended.');
  return user;
}

/**
 * Session cookie attributes.
 *
 * The API and the web app are separate origins. A browser will only send a
 * cookie across origins when it is `SameSite=None; Secure`, which requires
 * HTTPS — so production uses that, and development falls back to `Lax` over
 * plain HTTP. When the two are not same-site in development (say the app is on
 * 127.0.0.1 and the API on localhost) the cookie will not travel, which is why
 * the API also accepts a bearer token. See DEPLOYMENT.md.
 */
export function cookieOptions(expiresAt: Date) {
  const production = env().NODE_ENV === 'production';
  return {
    httpOnly: true,
    sameSite: production ? ('none' as const) : ('lax' as const),
    secure: production,
    path: '/',
    expires: expiresAt,
  };
}
