# Economy

## The shape

Credits are the single currency. They enter through work and leave through consumption, and the
whole design is an argument about the ratio between those two.

```
     SOURCES                                    SINKS
  ┌───────────────────┐                  ┌────────────────────┐
  │ refining ore      │                  │ ship purchases     │
  │ contract rewards  │  ──▶ credits ──▶ │ upgrade tiers      │
  │ station broker    │                  │ crafting fees      │
  │ level-up bonuses  │                  │ fuel               │
  │ daily stipend     │                  │ marketplace fees   │
  │ player sales      │                  │ listing fees       │
  └───────────────────┘                  │ broker spread      │
                                         └────────────────────┘
```

Player-to-player sales are not a source: they move credits sideways and destroy a fraction as fee.
Every trade shrinks the money supply slightly, which is the point.

---

## Materials

| Material | Rarity | Base value | Weight | Laser tier |
|---|---|---:|---:|---:|
| Iron | Common | 4 | 1.0 | 1 |
| Titanium | Uncommon | 14 | 1.2 | 1 |
| Platinum | Rare | 46 | 1.6 | 2 |
| Resonant Crystal | Rare | 62 | 0.8 | 2 |
| Helium-3 | Epic | 128 | 0.4 | 3 |
| Quantum Shard | Legendary | 640 | 0.2 | 4 |

Two dimensions do the work here.

**Value rises faster than weight falls.** A hold full of Quantum Shards is worth 160× the same hold
of iron. Cargo capacity is therefore a real strategic choice rather than a number to maximise, and
a small fast hull working a deep field can out-earn a hauler working a shallow one.

**Laser tier is a hard gate.** A tier-1 beam never returns platinum, however long it runs. That is
what makes the mining upgrade path matter — it opens materials, not percentages.

`baseValue` is the anchor for every credit figure in the game. Tuning the economy is editing that
column and nothing else.

---

## Sources

### Refining — the primary faucet

The refinery pays **62%** of catalogue value, plus up to 8% from a Portable Refiner. The missing
38% is the largest sink in the game, and it is invisible: players experience it as "what ore is
worth", not as a tax.

A full Pickaxe hold (180 units) of Nova Belt ore refines to roughly 500–700 credits, taking about
five minutes to gather. That sets the baseline: **a new player earns on the order of 6,000
credits an hour**, which is the number every price below is calibrated against.

Deep-field ore is worth several times that per trip, offset by fuel, travel time and hazard.

### Contracts

Between 250 credits (an orientation walk) and 34,000 (a Rift salvage run). Contracts pay roughly
1.5–2× what the equivalent time spent mining would, which is what makes them worth the constraint
of an objective and a deadline. They also pay reputation, which nothing else does at scale.

### The station broker

Buys ore instantly at **86%** of base and sells at **122%**. The 36-point spread is a sink and a
liquidity floor: a player can always convert ore to credits immediately, and always pays for the
convenience. It also puts a floor and a ceiling on the player exchange — nobody sells below 86% or
buys above 122% when the station is always there.

### Level-ups and the stipend

`250 + 120 × level` per level, and 500 credits a day for logging in. Both are small and exist to
keep a new or returning player moving rather than stuck. Combined they are under 5% of the credits
a regular player earns.

---

## Sinks

| Sink | Scale | Role |
|---|---|---|
| Refining loss | 38% of all ore value | The main sink. Invisible and unavoidable |
| Broker spread | 14–22% per trade | Liquidity has a price |
| Marketplace fee | 2.5%, floor 1% | Every player trade shrinks the supply |
| Listing fee | 50c | Makes spam listings cost something |
| Ship purchases | 4,800–68,000c | Mid-game goal |
| Upgrades | 900c × 1.85ⁿ | The deepest sink; tier 5 costs ~10,000c alone |
| Crafting | 400–24,000c plus materials | Gates rare modules behind both |
| Fuel | 3c per unit | A per-trip cost that scales with distance |

### The upgrade curve

Geometric growth is what stops a mature player drowning in credits. Six stats × five tiers, at
1.85× per tier, is **roughly 190,000 credits per hull fully upgraded** — around thirty hours of
play at the baseline rate, and that is one ship.

---

## Fees

```
price ──▶ fee = price × feeBps / 10000  ──▶ treasury 60% / reward vault 40%
      └──▶ seller receives the remainder
```

Base fee 250 bps (2.5%). Faction standing reduces it by up to 25%, with a hard floor of 100 bps —
so a maxed player still pays 1%, and the fee can never reach zero.

The identical basis-point arithmetic is implemented in `packages/game-engine/src/economy.ts` and in
`NovaMarketplace.sol`, so the number a player is quoted is the number the chain charges. The
contract caps the fee at 1000 bps regardless of admin intent.

---

## Price sanity

Listings are bounded to **0.1×–25×** the item's catalogue value, plus an absolute ceiling. This
stops the marketplace being used to shuffle absurd sums between accounts, and stops a fat-fingered
listing from being sniped.

It is a bound, not a fixed price. Within that window the market sets its own value, and rare items
routinely trade well above catalogue.

---

## Inflation

Every credit is created by a named source and destroyed by a named sink, and every movement leaves
a ledger row. That makes the money supply a query rather than an estimate.

**Structurally deflationary at maturity.** The largest source, refining, is capped by how much ore
a player can physically gather in a session. The largest sink, upgrades, grows geometrically. A
player who plays more earns linearly and spends exponentially.

The pressure points, honestly stated:

- **A maxed player with nothing to buy** accumulates. The answer today is the marketplace, where
  credits move sideways and shrink; the real answer is more high-tier sinks, which is what ownable
  station modules are for.
- **The daily stipend is unconditional.** Small, but it is a faucet that does not require play. If
  it were ever exploited at scale it should become a first-play-of-the-day reward instead.
- **Deep fields scale value faster than time.** The Rift pays several times the Nova Belt per hour.
  Hazard, fuel and the level and standing gates are the brakes; if it ever needs another, hazard
  is the honest lever.

---

## No pay-to-win

The commitment, concretely:

**Every on-chain item has a craftable equivalent with identical stats.** Not similar — identical.
The Advanced Mining Laser has a schematic; so does the Harmonic Extractor. Buying one with ETH
saves the grind, exactly as buying one with credits does. It buys nothing a player cannot earn.

**Nothing is sold for real money by us.** There is no premium currency, no loot box, no paid
battle pass. The only ETH in the system moves between players through the marketplace, and the only
fee is the same 2.5% a credit sale pays.

**Ownership buys provenance and the right to sell, not power.** An Aurora Prime is the best hull in
the game and cannot be bought with credits — but it is *awarded* for play, not sold, and its
advantage over a fully-upgraded Meridian is modest.

**Cosmetics are cosmetic.** The rare ones carry no stats at all.

This is a real constraint on design, and it is the point. A Web3 game where the on-chain items are
strictly better is a game where the wallet is the skill.

---

## If a token were ever added

It is not, deliberately. Credits are a database number; the value in this game lives in the assets.

If one were warranted, the sequence that would make it defensible: a working economy with measured
sources and sinks first; a clear utility that credits genuinely cannot serve; a supply schedule
tied to sinks rather than emissions; and no pre-sale. A token launched alongside a game, rather
than years into one, is a fundraise wearing a game's clothes — which is precisely the pattern this
project is arguing against.
