# Deployment

## Local

See the [README](../README.md#local-setup). Short version:

```bash
pnpm install
pnpm db:up
cp .env.example apps/server/.env && cp .env.example apps/web/.env.local
pnpm db:migrate && pnpm db:seed
pnpm dev
```

Web on 3300, API on 4300, Postgres on 5491, Redis on 6391. The non-default database ports are
deliberate so this stack can run alongside others.

**Use the same hostname for both apps.** In development the session cookie is `SameSite=Lax`, and a
browser treats `localhost` and `127.0.0.1` as different sites. The API also accepts a bearer token
so it works either way, but `localhost` everywhere avoids the question.

---

## Contracts

### Local (anvil)

```bash
pnpm chain:node                     # terminal 1
pnpm chain:deploy:local             # terminal 2
```

Writes `contracts/deployments/31337.json`. Copy the four addresses into `apps/server/.env` as
`CONTRACT_*` and `apps/web/.env.local` as `NEXT_PUBLIC_CONTRACT_*`. Anvil's first well-known
account is used as the deployer; it is a public key and must never be used anywhere real.

### Sepolia

```bash
cd contracts
cp ../.env.example .env             # fill PRIVATE_KEY, SEPOLIA_RPC_URL, ETHERSCAN_API_KEY
pnpm deploy:sepolia
```

Before deploying:

1. Fund the deployer from a Sepolia faucet.
2. Decide who holds which role. `NOVA_MINTER` and `NOVA_SIGNER` should be the **game server's** key,
   not the deployer's. `NOVA_TREASURY` receives the fee split.
3. Set `NOVA_BASE_URI` to a metadata host you control.

After deploying:

1. Copy the addresses from `contracts/deployments/11155111.json` into both `.env` files.
2. Set `INDEXER_START_BLOCK` to the deployment block so a fresh database does not scan from genesis.
3. Set `CHAIN_ID=11155111` and point `RPC_URL` / `NEXT_PUBLIC_RPC_URL` at a Sepolia endpoint.
4. Verify the deployer no longer holds `MINTER_ROLE` if you granted it elsewhere.

### Deployed addresses

| Contract | Network | Address |
|---|---|---|
| NovaAssets | anvil (31337) | `0xc6e7DF5E7b4f2A278906862b61205850344D4e7d` |
| NovaItems | anvil (31337) | `0x59b670e9fA9D0A427751Af201D676719a970857b` |
| NovaMarketplace | anvil (31337) | `0x322813Fd9A801c5507c9de605d63CEA4f2CE6c44` |
| NovaRewardVault | anvil (31337) | `0x4ed7c70F96B99c776995fB64377f0d4aB3B0e1C1` |
| *(all four)* | **Sepolia** | **not yet deployed** — needs a funded key |

The Sepolia row is blank because deploying needs a funded private key that this repository does not
and should not contain. `pnpm chain:deploy:sepolia` performs the deployment and rewrites this
table's source of truth at `contracts/deployments/11155111.json`.

---

## Production

### Server

A stateless Node process. `pnpm --filter @nova/server build` produces a self-contained `dist/`
(the generated Prisma client is copied in), and `node dist/index.js` runs it.

Requirements:

- **PostgreSQL 16.** Run `prisma migrate deploy` on release, then `db:seed` after any content
  change. The seed is idempotent.
- **A reverse proxy that forwards WebSocket upgrades.** The gateway shares the HTTP server on
  `/ws`. Without upgrade forwarding, multiplayer silently fails while everything else works.
- **`SESSION_SECRET`** of at least 32 characters. The server refuses to start in production without
  it. Rotating it invalidates every live session.
- **`CORS_ORIGINS`** listing exactly the web origins, with no trailing slashes.
- **HTTPS.** In production the session cookie is `SameSite=None; Secure`, which browsers only
  accept over TLS.

Sample nginx:

```nginx
location /ws {
  proxy_pass http://127.0.0.1:4300;
  proxy_http_version 1.1;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";
  proxy_read_timeout 3600s;
}

location / {
  proxy_pass http://127.0.0.1:4300;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto $scheme;
}
```

The server trusts `X-Forwarded-*`, so the proxy must set them.

### Web

A standard Next.js build. `pnpm --filter @nova/web build` then `pnpm --filter @nova/web start`, or
deploy to any Next-compatible host.

`NEXT_PUBLIC_*` variables are compiled into the browser bundle at build time, so a change to the
API URL or a contract address needs a rebuild, not a restart. Never put a secret behind that prefix.

### Same-site or not

Two options, and the choice determines the cookie configuration:

**Same site (recommended).** Serve the app at `nova.example` and the API at `api.nova.example`.
They share a registrable domain, so the session cookie travels with `SameSite=Lax` and nothing
else is needed.

**Cross site.** Anything else. The cookie needs `SameSite=None; Secure` (which production already
sets), HTTPS on both, and the API origin listed in `CORS_ORIGINS`. The bearer-token fallback keeps
the session working within a tab even where the cookie is blocked entirely.

### Scaling

The server is stateless *except* for the realtime `Room`, which lives in one process's memory. One
process serves one world. See [MULTIPLAYER.md](MULTIPLAYER.md#scaling-beyond-one-process) for what
horizontal scaling would take.

The indexer must run in exactly one process. Running several would duplicate work and race on the
cursor — set `INDEXER_ENABLED=false` on every instance but one.

---

## Pre-flight checklist

- [ ] `SESSION_SECRET` set to a real random value
- [ ] `NODE_ENV=production`
- [ ] `DATABASE_URL` points at a database with backups
- [ ] `prisma migrate deploy` run; `db:seed` run
- [ ] `CORS_ORIGINS` lists exactly the real web origins
- [ ] `SIWE_DOMAIN` matches the host players actually visit
- [ ] `PUBLIC_WEB_ORIGIN` matches too
- [ ] HTTPS terminating in front of both apps
- [ ] WebSocket upgrades forwarded to `/ws`
- [ ] Contract addresses set in both `.env` files
- [ ] `INDEXER_START_BLOCK` set to the deployment block
- [ ] `INDEXER_ENABLED=true` on exactly one instance
- [ ] `MINTER_PRIVATE_KEY` holds `MINTER_ROLE` and `SIGNER_ROLE` — and nothing more
- [ ] Deployer key moved to cold storage or a multisig
- [ ] `pnpm verify:all` green

---

## Monitoring

`GET /health` reports process, database and chain configuration:

```json
{ "status": "ok", "database": "up", "version": "1.0.0", "chainId": 11155111, "uptimeSec": 4735 }
```

Logs are structured JSON via pino, with authorization headers, cookies, signatures and message
bodies redacted. Worth alerting on: `database: "down"`, indexer poll failures, a rising rate of
movement corrections (a broken client or a probing one), and mint failures after an inventory burn
— the one place a failure leaves a player short.
