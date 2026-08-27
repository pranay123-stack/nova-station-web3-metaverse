# Contributing

## Getting set up

See the [README](README.md#local-setup). Then:

```bash
pnpm verify:all     # typecheck, lint, every test suite, production build
```

If that is green, your environment is correct.

---

## The rules that matter

**1. Game rules live in `@nova/game-engine`, never in a component or a route.**

If a panel needs to know whether a craft is affordable, it calls the engine. If a route needs to
know what an upgrade costs, it calls the engine. There must be exactly one implementation of every
rule, because the client and the server both run it and any second implementation will drift.

**2. Content lives in `@nova/game-data` and contains no behaviour.**

Tables and constants only. No imports, no logic, no I/O. This is what lets a test, the server, the
browser and a future tool all read the same catalogue.

**3. The server never trusts the client.**

Every mutating route validates with a Zod schema before a service sees it. Every service that
touches value works inside one database transaction. Every spend uses a conditional update rather
than read-then-write. If you find yourself adding a field to a request that the server could
compute itself, compute it instead.

**4. Credits move through `moveCredits()`. Always.**

It is the only function that writes `User.credits`, and it writes a ledger row every time. A direct
update elsewhere breaks the invariant that the ledger can reconstruct any balance — which a test
asserts.

**5. The render loop does not touch React state.**

Anything that changes at frame rate — positions, camera, animation — is a mutable object read
inside `useFrame`. Anything that changes on a server response goes in a store. Putting a position
in a store re-renders the scene sixty times a second.

**6. Nothing pretends.**

No fake transactions, no simulated confirmations, no placeholder balances, no buttons that do
nothing. If something cannot be implemented, it says so in the interface and in the README's
limitations.

---

## Adding content

### A resource

`packages/game-data/src/resources.ts`. Set `baseValue` deliberately — it anchors every credit
figure that touches it. Add it to at least one mining zone's table, or nobody can get it. The
content test will fail if it is unreachable or if `minLaserTier` refers to a tier no ship reaches.

### A ship

`packages/game-data/src/ships.ts`. Pick one of the five `silhouette` values — the renderer draws
from those, so a new one needs a new case in `ShipModel`. If `creditPrice` is `null` the hull
cannot be bought, so give it another route in (a reward, a mint) or it is unobtainable.

### A mission

`packages/game-data/src/missions.ts`, and run `pnpm db:seed`. Objectives are matched by the engine,
so use an existing objective kind unless you also extend `applyEvent`. The content test verifies
every reward item, every referenced zone and every referenced recipe exists.

**No UI work is needed.** Missions are pure data; the panel renders whatever is in the table.

### A recipe

`packages/game-data/src/recipes.ts`. `station` must be `'lab'` — that is the only bench in the
station. Faction-gated recipes are the main way faction choice cashes out, so they are encouraged.

### An on-chain item

Three places, in this order:

1. `packages/game-data/src/items.ts` — set `onChainEligible: true`
2. `packages/shared/src/item-registry.ts` — assign the next token id
3. `contracts/script/Deploy.s.sol` — register the same id

A test reads the deploy script and compares it to the registry, so getting this wrong is a test
failure rather than a production bug where a player's token resolves to the wrong item.

### A station prop or area

`packages/game-data/src/station/`. Props with `solid: true` become colliders **and** renderable
geometry from the same definition — there is no separate visual station that could drift from the
one you can walk into.

Keep the step-height rule in mind: anything under 0.55m tall is walked over, not blocked. A prop at
0.6m reads as an invisible wall and is exactly the bug that produced that rule.

New areas need an entry in `STATION_AREAS`, a corridor in `CORRIDORS`, a doorway gap in
`ROOM_WALLS`, and a row in `AREA_GRAPH`. The geometry test checks that every doorway is actually
clear.

---

## Testing

Add tests with behaviour. The suites are split by what they protect:

| Suite | Add here when you… |
|---|---|
| `game-data` | Add content — the integrity tests catch dangling references |
| `game-engine` | Change a rule. Test the boundaries, not the happy path |
| `shared` | Change the wire contract |
| `server` | Add a route. **Add an anti-cheat test too** |
| `contracts` | Touch Solidity. Include the unauthorised case |
| `web` | Add logic outside a component |
| e2e | Change the player's path through the game |

The server suite runs against a real Postgres (`nova_station_test`) sequentially, because the files
share one database and truncate between tests.

An anti-cheat test should exercise the thing a modified client would actually try, through the HTTP
surface — that is the only interface an attacker has. Concurrency tests should fire genuinely
concurrent requests rather than reasoning about interleaving.

---

## Style

TypeScript strict throughout, including `noUncheckedIndexedAccess`. Prettier decides formatting;
do not argue with it. `pnpm format` before committing.

Comments explain **why**, not what. A comment restating the code is noise; a comment explaining why
the first movement report is measured against a backdated timestamp is the difference between a
future maintainer keeping the fix and deleting it.

Commit messages: imperative mood, one line, plus a body when the reasoning is not obvious from the
diff.

---

## Pull requests

Run `pnpm verify:all`. If you changed the game's balance, say what you changed and why in the
description — the economy is calibrated against a stated baseline in
[ECONOMY.md](docs/ECONOMY.md), and moving one number moves others.

If you found a security issue, do not open a public pull request. See [SECURITY.md](SECURITY.md).
