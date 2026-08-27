# Tests

Tests live next to the code they cover, not in this directory. That is deliberate: a test that
sits beside its subject gets updated when the subject changes, and a test in a distant folder
quietly rots.

| Where | What | Run with |
|---|---|---|
| `packages/game-data/test/` | Content integrity, station geometry, progression maths | `pnpm --filter @nova/game-data test` |
| `packages/game-engine/test/` | Collision, controller, mining, crafting, missions, economy | `pnpm --filter @nova/game-engine test` |
| `packages/shared/test/` | Protocol validation, TypeScript↔Solidity id agreement | `pnpm --filter @nova/shared test` |
| `packages/web3/test/` | SIWE parsing, EIP-712 vouchers, transaction states | `pnpm --filter @nova/web3 test` |
| `contracts/test/` | Mint, transfer, marketplace, fees, roles, reentrancy, fuzz | `pnpm test:contracts` |
| `apps/server/test/` | Auth, gameplay, anti-cheat, marketplace, multiplayer | `pnpm --filter @nova/server test` |
| `apps/web/src/**/*.test.ts` | Interpolation, formatting | `pnpm --filter @nova/web test` |
| `apps/web/e2e/` | The whole journey in a browser, with a real signing wallet | `pnpm test:e2e` |

Everything at once:

```bash
pnpm verify:all
```

## What needs to be running

- **Server tests** need PostgreSQL on `localhost:5491` with a `nova_station_test` database. Run
  `pnpm db:up`, then `DATABASE_URL=…nova_station_test pnpm --filter @nova/server db:deploy`. The
  suite runs sequentially because the files share one database and truncate between tests.
- **E2E** needs both apps built and running. `pnpm build && pnpm dev`, then `pnpm test:e2e`.
- **Contract tests** need Foundry. Nothing else.
- **`apps/server/scripts/verify-chain.mjs`** is a manual check of the on-chain seam and needs a
  local anvil node with the contracts deployed. It is not part of `verify:all` because it needs a
  chain.
