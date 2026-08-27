# Architecture

## The one idea

Everything below follows from a single decision: **the client and the server run the same game
code.**

`@nova/game-engine` is a pure, dependency-free TypeScript library. The browser imports it to
predict movement and preview an upgrade; the server imports it to validate that movement and to
bill for that upgrade. `stepCharacter` is not "the client's controller" — it is *the* controller,
and the server calls it too. `computeShipStats` is not "the hangar's preview" — the number it
returns is the number the server charges for.

This is what makes a hostile client uninteresting. There is no second implementation to disagree
with, no drift between what a player sees and what the server believes, and no place for a
"client-side estimate" to quietly become authoritative.

---

## Repository layout

```
nova-station/
├── apps/
│   ├── web/                  Next.js 15 client
│   │   ├── src/app/          routes: landing, /play, /marketplace, /profile/[address]
│   │   ├── src/game/         scene/, systems/, net/, audio/  — the 3D game
│   │   ├── src/ui/           hud/, panels/  — everything drawn over the canvas
│   │   ├── src/stores/       zustand stores
│   │   └── e2e/              Playwright, including a real signing wallet
│   └── server/               Fastify game server
│       ├── src/routes/       HTTP surface
│       ├── src/services/     all game logic, all transactional
│       ├── src/ws/           realtime gateway, rooms, rate limiting
│       ├── src/indexer/      chain → database mirror
│       ├── src/auth/         SIWE and sessions
│       └── prisma/           schema and migrations
├── packages/
│   ├── game-data/            static content + station geometry. No logic.
│   ├── game-engine/          pure deterministic simulation. No I/O.
│   ├── shared/               protocol schemas, DTOs, error codes, contract ABIs
│   ├── web3/                 chains, addresses, SIWE, EIP-712, tx state machine
│   └── ui/                   presentational React components and design tokens
├── contracts/                Foundry project
├── docs/
└── infra/                    docker-compose for Postgres and Redis
```

### Why the packages are split this way

`game-data` holds content and **no behaviour**: tables of resources, ships, missions, recipes, and
a declarative station layout. It has no dependencies at all, which is what lets the server, the
browser, a test and a future tool all read the same catalogue without dragging anything with it.

`game-engine` holds behaviour and **no content**: it takes data in and returns results. Because it
never reaches for a database, a clock or a random number it did not receive, every function in it
is testable in isolation and reproducible from its inputs. That is why 125 unit tests can cover the
whole simulation in under a second.

`shared` is the wire contract — Zod schemas for every request and every socket frame, the DTOs the
API returns, and the generated contract ABIs. If the client and server ever disagree about a
payload, it is a compile error rather than a production bug.

---

## Data flow

### Reading

```
Postgres ──▶ service ──▶ DTO (packages/shared) ──▶ HTTP ──▶ zustand store ──▶ React
```

Stores are mirrors. They never compute a balance, a level or an effective stat — they replace what
they hold with whatever the last response said. The moment a store starts deriving an economic
number, its copy and the server's start to drift, and the interface begins to lie.

### Writing

```
React ──▶ api.post ──▶ Zod parse ──▶ service ──▶ $transaction { engine + ledger + events }
                                                          │
                                                          └──▶ fresh DTO back to the client
```

Every mutating route validates with a schema before a service sees it, and every service that
touches value does its work inside one database transaction. Mutations return the updated player
state so the client never has to guess what changed.

### The realtime path

```
useFrame ──▶ stepCharacter ──▶ gameSocket.pose (mutable object)
                                     │  10 Hz, and only when it changed
                                     ▼
                              validateMovement ──▶ Room ──▶ 10 Hz snapshots
                                                              │
                                     RemoteBuffer ◀───────────┘
                                          │  sampled every frame, 150ms behind
                                          ▼
                                     remote bodies
```

Note what is *not* in that loop: React. Positions are written to a plain mutable object and read
inside `useFrame`. Putting them in a store would re-render the scene sixty times a second for
values React has no opinion about. React is told when someone joins or leaves — a few times a
session — and nothing else.

---

## The game engine

| Module | Responsibility |
|---|---|
| `math` | Vectors, framerate-independent damping, angle wrapping |
| `rng` | Seeded mulberry32; every economic roll comes from here |
| `collision` | Spatial hash, ground queries, exact swept axis tests, penetration recovery |
| `character` | The controller: gravity, jump, step-up, slopes, air control |
| `movement-validation` | The server's verdict on a claimed position |
| `ships` | Base + upgrade tiers + additive modules + multipliers, in that fixed order |
| `mining` | Yield resolution, minigame clamping, hazard rolls |
| `crafting` | Preconditions and outcome resolution |
| `missions` | Objective matching, progress, acceptance gates, reward resolution |
| `progression` | XP curve, level-ups, faction standing with cross-effects |
| `economy` | Fees, spreads, refining, price sanity bounds |
| `inventory` | Item resolution, cargo weight, affordability |

### Collision, specifically

The station is a few hundred axis-aligned boxes and a handful of walkable surfaces, indexed in a
uniform grid over the XZ plane. Two details are worth calling out because both were bugs first:

**The sweep is exact, not sampled.** An early version tested only the destination point, which
meant a large step — a lag spike, a slow frame, a server replaying a batch — passed straight
through a wall. `sweepAxis` now solves the 1D crossing analytically, so no timestep tunnels.

**Step height is a single rule, applied twice.** Anything whose top is below `feet + stepHeight` is
not an obstruction; it is ground. The controller and the server's validator both use that same
rule, which is what stops a kerb the player can walk over from reading as "inside geometry" to the
validator.

---

## Database

Prisma 7 over PostgreSQL 16. The tables fall into three groups.

**Reference** — `Resource`, `Faction`, `Mission`, `Achievement`, `StationArea`. Mirrors of the
static catalogues, seeded from `@nova/game-data`. They exist so player rows can carry real foreign
keys and so analytics can join against readable names. The catalogue remains the source of truth;
the seed is idempotent.

**Authoritative** — `User`, `InventoryItem`, `Ship`, `PlayerMission`, `Expedition`, `CraftJob`,
`MarketplaceListing`, `PlayerFaction`. Written only by server services, only inside transactions.

**Projected** — `BlockchainAsset`, `IndexerCursor`, and the on-chain half of
`MarketplaceListing`. Written only by the indexer, from event logs, and rebuildable from scratch by
resetting the cursor. Never a source of truth: where ownership decides something, the server reads
the chain directly.

### The ledger

`LedgerEntry` is append-only and records every credit movement with its reason and the resulting
balance. `User.credits` is a cache of its running total, and `replayBalance()` reconstructs the
balance from the journal — a server test asserts the two agree, including under concurrent writes.

This costs one insert per transaction and buys the ability to answer "how did this account get
these credits" after the fact, which is the difference between suspecting an economy exploit and
proving one.

### Concurrency

Anything that spends does so with a conditional update rather than a read-then-write:

```ts
// Not: read balance, check it, write it back.
const debited = await tx.user.updateMany({
  where: { id: userId, credits: { gte: -delta } },
  data: { credits: { increment: delta } },
});
if (debited.count !== 1) throw new GameError('insufficient_credits', …);
```

The same shape closes a listing, claims a mission and consumes a SIWE nonce. Two requests racing
produce one success and one clean failure, which the anti-cheat suite asserts by firing genuinely
concurrent requests rather than by reasoning about it.

---

## Rendering

The station is drawn from `getStationGeometry()` — the same call the collision system makes.
Solids are grouped by material into `InstancedMesh`, so several hundred boxes cost roughly a dozen
draw calls.

Lighting is the main performance lever. Eleven point lights would all be evaluated by every
fragment, so only the lights in the player's current sector and its neighbours are mounted; the
rest do not exist as far as the shader is concerned. Post-processing is quality-gated and the scene
reads correctly with it off.

A frame-rate governor measures what the machine is actually achieving and steps quality down one
level at a time when it cannot hold the target. It never steps back up on its own — oscillating
between quality levels is worse than sitting at the lower one.

### Why procedural geometry

No GLTF, no Draco, no texture atlases. Every mesh is primitives composed in code and every sound
is synthesised from oscillators. The trade is real: the art style is constrained to flat-shaded
sci-fi, and a modelled station would look better. What it buys is a world that downloads in
kilobytes, has no licensing questions, needs no asset pipeline, and can be parameterised — an
avatar's suit colour is a uniform rather than a texture variant, and a ship's palette comes from
its catalogue entry.

---

## Where the boundaries are

| Concern | Lives in | Never in |
|---|---|---|
| What things are | `game-data` | Components, services |
| What happens | `game-engine` | Components, routes |
| What is true | The server + Postgres | The client |
| What it looks like | `apps/web/src/game`, `src/ui` | The engine |
| Who owns what | The chain, for assets that matter | The database alone |

The rule that keeps this honest: **a React component may not contain a game rule.** If a panel
needs to know whether a craft is affordable, it calls the engine. If it needs to know what a
mission requires, it reads the mission definition. There is no arithmetic in the UI layer that the
server does not also perform.
