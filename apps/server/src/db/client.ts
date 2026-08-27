import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';
import { env } from '../env.js';

/**
 * The Prisma client.
 *
 * One instance is shared process-wide; creating a client per request exhausts
 * the connection pool under any real load. The connection string is read from
 * the validated environment here rather than from the schema, which is how
 * Prisma 7 wants it.
 */
let cached: PrismaClient | null = null;

export function prisma(): PrismaClient {
  if (cached) return cached;
  const config = env();
  const adapter = new PrismaPg({ connectionString: config.DATABASE_URL });
  cached = new PrismaClient({
    adapter,
    log: config.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });
  return cached;
}

export async function disconnectPrisma(): Promise<void> {
  if (!cached) return;
  await cached.$disconnect();
  cached = null;
}

/** Test hook: point the process at a different database. */
export function setPrismaClient(client: PrismaClient | null): void {
  cached = client;
}

export type Db = PrismaClient;
/** A transaction handle. Every mutating service takes one of these. */
export type Tx = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$extends'
>;
