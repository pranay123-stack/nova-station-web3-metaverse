import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

/**
 * Prisma 7 configuration.
 *
 * The connection URL lives here (for migrations) and in the driver adapter the
 * client is built with (for runtime) — never in `schema.prisma`, which is
 * committed. Both read the same environment variable, so there is exactly one
 * place a connection string can come from.
 */
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx src/db/seed.ts',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
});
