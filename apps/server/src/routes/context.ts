import type { FastifyReply, FastifyRequest } from 'fastify';
import { GameError } from '@nova/shared';
import type { ZodType } from 'zod';
import { SESSION_COOKIE, requireUser, resolveSession, type SessionUser } from '../auth/session.js';
import { prisma } from '../db/client.js';

declare module 'fastify' {
  interface FastifyRequest {
    sessionUser: SessionUser | null;
  }
}

/** Reads the session from the cookie, or from a bearer token for API clients. */
export function readToken(request: FastifyRequest): string | undefined {
  const cookie = request.cookies?.[SESSION_COOKIE];
  if (cookie) return cookie;
  const header = request.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7);
  return undefined;
}

export async function loadSession(request: FastifyRequest): Promise<void> {
  request.sessionUser = await resolveSession(prisma(), readToken(request));
}

/** Throws `unauthorized` unless the request carries a live, unbanned session. */
export function auth(request: FastifyRequest): SessionUser {
  return requireUser(request.sessionUser ?? null);
}

/**
 * Parses a request body or query against a schema.
 *
 * Nothing reaches a service without passing through here first: unvalidated
 * input is the shortest path from "a player sent something odd" to "the
 * economy has a new hole in it".
 */
export function parse<T>(schema: ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new GameError('validation_failed', 'That request was not valid.', {
      issues: result.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    });
  }
  return result.data;
}

export function ok<T>(reply: FastifyReply, payload: T): T {
  reply.code(200);
  return payload;
}

export function created<T>(reply: FastifyReply, payload: T): T {
  reply.code(201);
  return payload;
}
