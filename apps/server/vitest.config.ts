import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    testTimeout: 30000,
    hookTimeout: 30000,
    // Every test file drives the same Postgres database and truncates between
    // tests, so they must not run concurrently with each other.
    fileParallelism: false,
    sequence: { concurrent: false },
  },
});
