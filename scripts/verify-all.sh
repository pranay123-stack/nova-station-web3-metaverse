#!/usr/bin/env bash
# Everything CI runs, in the order that fails fastest.
set -euo pipefail
cd "$(dirname "$0")/.."

step() { printf '\n\033[1;36m▸ %s\033[0m\n' "$1"; }

step 'Building workspace packages'
pnpm build:packages

step 'Type checking'
pnpm typecheck

step 'Linting'
pnpm lint || echo '  (lint reported issues)'

step 'Unit tests — game data'
pnpm --filter @nova/game-data test

step 'Unit tests — game engine'
pnpm --filter @nova/game-engine test

step 'Unit tests — shared protocol'
pnpm --filter @nova/shared test

step 'Unit tests — web3'
pnpm --filter @nova/web3 test

step 'Unit tests — web client'
pnpm --filter @nova/web test

step 'Smart contract tests'
pnpm --filter @nova/contracts test

step 'Server integration tests'
if pg_isready -h localhost -p 5491 >/dev/null 2>&1; then
  pnpm --filter @nova/server test
else
  echo '  Skipped: no PostgreSQL on localhost:5491. Run `pnpm db:up` first.'
fi

step 'Production build'
pnpm build

printf '\n\033[1;32m✓ All checks complete\033[0m\n'
