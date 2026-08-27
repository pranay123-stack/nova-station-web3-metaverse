#!/usr/bin/env node
/**
 * Copies the generated Prisma client into the build output.
 *
 * The client is generated JavaScript, so `tsc` leaves it behind. Copying it
 * keeps `dist/` self-contained: `node dist/index.js` runs without needing the
 * source tree beside it, which is what the Docker image relies on.
 */
import { cp, access } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const from = resolve(here, '../src/generated');
const to = resolve(here, '../dist/generated');

try {
  await access(from);
} catch {
  console.error('[copy-prisma-client] src/generated is missing — run `prisma generate` first.');
  process.exit(1);
}

await cp(from, to, { recursive: true });
console.log('[copy-prisma-client] copied generated Prisma client into dist/');
