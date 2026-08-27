import { z } from 'zod';

/**
 * Validated process environment.
 *
 * The server refuses to start on a bad configuration rather than failing at the
 * first request. Secrets have no defaults outside development — a production
 * boot with a missing JWT secret is a crash, not a warning.
 */
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4300),
  HOST: z.string().default('0.0.0.0'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  /// Comma-separated list of allowed browser origins. Both loopback spellings
  /// are allowed by default because a browser treats them as distinct origins
  /// and developers reach for either.
  CORS_ORIGINS: z.string().default('http://localhost:3300,http://127.0.0.1:3300'),
  /// Public origin of the web client, used to build SIWE messages.
  PUBLIC_WEB_ORIGIN: z.string().default('http://localhost:3300'),
  /// Domain a wallet will display when signing in.
  SIWE_DOMAIN: z.string().default('localhost:3300'),

  /// HMAC key for session tokens. Must be set outside development.
  SESSION_SECRET: z.string().min(32).optional(),
  SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(720).default(72),

  CHAIN_ID: z.coerce.number().int().default(11155111),
  RPC_URL: z.string().optional(),

  CONTRACT_ASSETS: z.string().optional(),
  CONTRACT_ITEMS: z.string().optional(),
  CONTRACT_MARKETPLACE: z.string().optional(),
  CONTRACT_REWARD_VAULT: z.string().optional(),

  /// Key the server mints assets and signs reward vouchers with. Optional: the
  /// game is fully playable without it, minus on-chain minting.
  MINTER_PRIVATE_KEY: z
    .string()
    .regex(/^0x[a-fA-F0-9]{64}$/, 'must be a 32-byte hex private key')
    .optional(),

  INDEXER_ENABLED: z
    .string()
    .default('true')
    .transform((value) => value !== 'false'),
  INDEXER_POLL_MS: z.coerce.number().int().min(1000).max(120_000).default(6000),
  INDEXER_START_BLOCK: z.coerce.number().int().min(0).default(0),
  /// Blocks behind head before an event is treated as settled.
  INDEXER_CONFIRMATIONS: z.coerce.number().int().min(0).max(64).default(2),

  RATE_LIMIT_MAX: z.coerce.number().int().min(10).default(300),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1000).default(60_000),
  /// The sign-in endpoints are limited far harder than the rest of the API:
  /// they are the only unauthenticated routes that write to the database.
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(20),

  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
});

export type Env = z.infer<typeof schema> & { SESSION_SECRET: string };

let cached: Env | null = null;

export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment:\n${issues}`);
  }

  let secret = parsed.data.SESSION_SECRET;
  if (!secret) {
    if (parsed.data.NODE_ENV === 'production') {
      throw new Error('SESSION_SECRET is required in production');
    }
    // Development only: a fixed key so sessions survive a restart.
    secret = 'nova-station-development-session-secret-key';
  }

  cached = { ...parsed.data, SESSION_SECRET: secret };
  return cached;
}

/** Test hook: forget the cached environment. */
export function resetEnv(): void {
  cached = null;
}

export function corsOrigins(): string[] {
  return env()
    .CORS_ORIGINS.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export function isProduction(): boolean {
  return env().NODE_ENV === 'production';
}
