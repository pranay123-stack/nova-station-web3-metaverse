import 'dotenv/config';
import { buildApp } from './app.js';
import { env } from './env.js';
import { bootLogger, logger } from './logger.js';
import { disconnectPrisma, prisma } from './db/client.js';
import { createGateway } from './ws/gateway.js';
import { startIndexer } from './indexer/indexer.js';
import { pruneNonces } from './auth/siwe.js';
import { pruneSessions } from './auth/session.js';

/** Housekeeping interval: expired nonces and sessions are swept hourly. */
const SWEEP_INTERVAL_MS = 60 * 60 * 1000;

async function main(): Promise<void> {
  const config = env();
  bootLogger();

  const app = await buildApp();
  await app.listen({ port: config.PORT, host: config.HOST });

  const gateway = createGateway(app.server);
  const indexer = startIndexer(prisma());

  const sweep = setInterval(() => {
    void (async () => {
      try {
        const nonces = await pruneNonces(prisma());
        const sessions = await pruneSessions(prisma());
        if (nonces + sessions > 0) {
          logger.debug({ nonces, sessions }, 'swept expired records');
        }
      } catch (error) {
        logger.error({ err: error }, 'sweep failed');
      }
    })();
  }, SWEEP_INTERVAL_MS);

  logger.info(
    { port: config.PORT, chainId: config.CHAIN_ID, env: config.NODE_ENV },
    'NOVA STATION server ready',
  );

  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'shutting down');
    clearInterval(sweep);
    indexer?.stop();
    await gateway.close();
    await app.close();
    await disconnectPrisma();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((error) => {
  logger.fatal({ err: error }, 'server failed to start');
  process.exit(1);
});
