import type { ApiErrorBody, ErrorCode } from '@nova/shared';

/**
 * The one place the client talks to the game server.
 *
 * Every call sends credentials (the session cookie) and every failure comes
 * back as an `ApiError` carrying the server's own error code, so callers branch
 * on a stable code rather than on a message string.
 */
export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4300';

/**
 * The session token, held in memory for the life of the tab.
 *
 * The httpOnly cookie is the primary credential; script cannot read it. This
 * copy exists because a browser refuses to send a `SameSite=Lax` cookie across
 * origins, which is exactly what happens when the API and the app are not
 * same-site — a normal development setup, and a common production one.
 *
 * It is stored on a symbol-keyed global rather than in a module variable
 * because the game shell is a dynamic import: the bundler is free to give that
 * chunk its own copy of this module, and two copies would mean the sign-in
 * writes one token while every subsequent request reads the other. A global is
 * the one location guaranteed to be shared however the bundle is split.
 *
 * Deliberately not localStorage: this dies with the tab, so it cannot be read
 * back by script injected into a later visit.
 */
const TOKEN_KEY = Symbol.for('nova.session.token');

interface TokenHolder {
  [TOKEN_KEY]?: string | null;
}

function holder(): TokenHolder {
  return globalThis as unknown as TokenHolder;
}

export function setSessionToken(token: string | null): void {
  holder()[TOKEN_KEY] = token;
}

export function getSessionToken(): string | null {
  return holder()[TOKEN_KEY] ?? null;
}

export function hasSessionToken(): boolean {
  return getSessionToken() !== null;
}

/** The token the game socket should present when the cookie cannot travel. */
export function sessionTokenForSocket(): string | null {
  return getSessionToken();
}

export class ApiError extends Error {
  constructor(
    readonly code: ErrorCode | 'network_error',
    message: string,
    readonly status: number,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface RequestOptions {
  readonly method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  readonly body?: unknown;
  readonly signal?: AbortSignal;
}

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, signal } = options;

  let response: Response;
  try {
    const headers: Record<string, string> = {};
    if (body !== undefined) headers['content-type'] = 'application/json';
    const token = getSessionToken();
    if (token) headers.authorization = `Bearer ${token}`;

    response = await fetch(`${API_URL}${path}`, {
      method,
      credentials: 'include',
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      ...(signal ? { signal } : {}),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new ApiError('network_error', 'Cannot reach the station server.', 0);
  }

  if (response.status === 204) return undefined as T;

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const body = payload as ApiErrorBody | null;
    throw new ApiError(
      body?.error?.code ?? 'internal_error',
      body?.error?.message ?? `Request failed (${response.status})`,
      response.status,
      body?.error?.details,
    );
  }

  return payload as T;
}

export const api = {
  get: <T>(path: string, signal?: AbortSignal) =>
    apiFetch<T>(path, signal ? { signal } : {}),
  post: <T>(path: string, body?: unknown) => apiFetch<T>(path, { method: 'POST', body }),
  put: <T>(path: string, body?: unknown) => apiFetch<T>(path, { method: 'PUT', body }),
};

/** True when a failure means "you are not signed in" rather than "that failed". */
export function isAuthError(error: unknown): boolean {
  return error instanceof ApiError && (error.code === 'unauthorized' || error.status === 401);
}
