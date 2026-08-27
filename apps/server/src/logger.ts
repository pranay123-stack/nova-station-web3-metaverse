import { pino } from 'pino';
import { env } from './env.js';

/**
 * Structured logging.
 *
 * Addresses are logged, request bodies are not: a body can contain a signature
 * or a message a player typed, and neither belongs in a log aggregator.
 */
export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  redact: {
    paths: ['req.headers.authorization', 'req.headers.cookie', 'signature', 'message'],
    remove: true,
  },
  ...(process.env.NODE_ENV !== 'production'
    ? {
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
        },
      }
    : {}),
});

export function bootLogger() {
  const config = env();
  logger.level = config.LOG_LEVEL;
  return logger;
}
