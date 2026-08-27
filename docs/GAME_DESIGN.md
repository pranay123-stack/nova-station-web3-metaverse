# Game design

## The loop

```
        ┌──────────────────────────────────────────────────┐
        ▼                                                  │
   take a contract ──▶ launch ──▶ fly the field ──▶ mine ──┤
        ▲                                                  │
        │                                                  ▼
   upgrade / craft ◀── refine or sell ◀────────────── come home
        │                                                  │
        └──────────── standing unlocks more ◀──────────────┘
```

A full cycle is five to fifteen minutes: accept, launch, twenty to eighty seconds of travel, work
three or four rocks, fly home, bank the haul, refine or sell, spend. Long enough to feel like a
trip, short enough that a session is several of them.

Every step is a real place you walk to. The mission board is a terminal on the Command Deck. The
refinery is a machine in the Mining Bay. Launch control is at the open aperture of the Docking Bay
with the belt visible beyond the containment field. Nothing is a menu you open from anywhere.

---

## The station

One continuous deck plan, connected by corridors and walkable ramps. No loading, no teleports —
walking between the Hangar and the Lab takes about forty seconds, which is the point: the station
has a geography you learn.

```
                      COMMAND DECK  (+7m, level 6)
                            │  ramp
    HANGAR ─────────── MARKETPLACE ─────────── LABORATORY (level 4)
                            │
                        HABITATS  ← you arrive here
                            │
                       MINING BAY
                            │  ramp
                      DOCKING BAY  (−4m, level 2)
```

| Sector | What it is for |
|---|---|
| **Habitats** | Arrival. Suit locker, public job board, standings, the noodle counter |
| **Marketplace** | The exchange, the station broker, and a Syndicate booth nobody licenses |
| **Hangar** | Six berths. Buy, select, rename, upgrade and fit ships |
| **Laboratory** | Fabrication benches and Federation research contracts |
| **Command Deck** | Mission command, the station registry, and the best view on Nova |
| **Mining Bay** | The refinery, bulk storage, and Helix's work board |
| **Docking Bay** | Launch control. The belt is on the other side of the field |

Areas gate on level, which paces the world's opening: a new arrival has the Habitats, Market,
Hangar and Mining Bay; the Docking Bay opens at 2, the Lab at 4, the Command Deck at 6.

---

## Mining

The part that had to be a game rather than a button.

**Travel** is real time — twenty seconds to the Nova Belt, eighty to the Rift — and the server
refuses extraction until the ship arrives. Faster hulls get there sooner and burn slightly more
doing it.

**The field** is a sphere of asteroids laid out from a seed the server generated. Because the
layout is deterministic, client and server agree on which rock is index seven — which is how the
server refuses a second extraction from the same rock without ever seeing the field.

**Extraction** is the resonance minigame. A band drifts along a frequency axis on two out-of-phase
sines; you slew the beam with W and S to stay inside it. Twelve seconds per rock. Holding the band
throughout is worth 1.45× the base yield; never finding it is worth 0.55×.

The skill expression is real but bounded, and bounded on purpose: it scales *amounts* only. Which
resources come out is decided from a server seed, so no amount of skill conjures a Quantum Shard
from a rock that does not have one. See [SECURITY.md](../SECURITY.md) for why the bound is where it
is.

**Coming home** is where ore becomes real. Everything mined lives on the expedition until it is
banked, so a disconnect loses the trip rather than duplicating it — and a hazard roll on the way
home can cost part of the cargo, mitigated by hull defence.

### The four fields

| Field | Level | Travel | Hazard | Character |
|---|---:|---:|---:|---|
| Nova Belt | 1 | 20s | 5% | The station's own debris ring. Iron and titanium |
| Kestrel Reach | 4 | 35s | 14% | Denser metal, the occasional platinum |
| Helix Claim 44 | 8 | 55s | 22% | Corporate lease. Needs Helix standing. Crystal and He-3 |
| The Rift | 14 | 80s | 42% | Off the charts. Quantum Shards, and it will take a hull |

---

## Progression

**Levels** (1–40) come from mining value, refining, contracts and crafting. The curve is a closed
form so the server can verify any level claim in constant time. Levels gate hulls, fields,
schematics and areas.

**Reputation** is per faction, and this is where the interesting decision lives: **standing bleeds
across factions.** Syndicate work costs you 35% of its value with the Federation. Helix and the
Federation are merely indifferent to one another. So the ladder is not a checklist — climbing one
means choosing not to climb another.

Eight ranks, shared across all three: Unknown, Visitor, Citizen, Trader, Explorer, Elite,
Commander, Legend. Standing unlocks contracts, schematics, hulls and mining fields, and earns a
marketplace fee discount of up to 25%.

### The factions

**Terran Federation** — *Knowledge before profit.* Charters the station, runs the Lab, funds survey
work, dim about unlicensed salvage. Research and exploration contracts.

**Helix Corporation** — *Every gram accounted for.* Owns the mining leases and half the hulls in
the Hangar. Pays reliably, negotiates ruthlessly, never forgets a shortfall. Delivery and quota
work.

**Void Syndicate** — *No manifest, no questions.* Not on any charter, yet always holding a booth in
the Market. The best rates and the worst odds.

---

## Ships

Six hulls across five classes. Stats are speed, cargo, fuel, mining power, defence and sensors.

| Hull | Class | Acquired | Character |
|---|---|---|---|
| Kestrel | Scout | Free at start | Fast, fragile, honest about both |
| Pickaxe MK II | Miner | 4,800c, level 3 | A drill with a cockpit bolted on |
| Mule-7 | Transport | 12,500c, level 6 | Enormous hold, unremarkable everything else |
| Meridian | Explorer | 34,000c, Federation rank 3 | Sensor mast longer than most scouts |
| Harrow | Combat | 68,000c, Void rank 3 | Officially does not exist |
| Aurora Prime | Explorer | Awarded, never sold | One hull in twelve. On chain |

Each stat has its own upgrade track — five tiers, each adding 12% of base and costing 1.85× the
last. Modules add flat stats and occasionally a multiplier, applied in a fixed order the client and
server both compute identically.

Mining power determines **laser tier**, which gates resources absolutely: a tier-1 beam never
returns platinum, however long it runs. That, rather than a drop-rate tweak, is what makes the
mining upgrade path matter.

---

## Crafting

Fifteen schematics at the Lab bench. Ore and credits in, a bench occupied for a real duration, an
item out — with a small chance of a bonus unit.

Crafting is the main **resource sink** and the only route to most rare modules. Several schematics
are gated behind faction standing, which is where the faction choice cashes out: a Federation
player builds a Harmonic Extractor, a Syndicate player builds a Pulse Cannon, and neither can build
the other's without the standing to match.

Two benches per player, so a long craft does not block everything.

---

## Contracts

Eighteen definitions across eight types: mining, exploration, delivery, recovery, rescue, combat,
research and trade. Each has a level gate, a faction rank gate, sometimes a ship-class requirement,
objectives, a time limit, and rewards in credits, XP, reputation, resources and a chance of a rare
drop.

Contracts are **pure data**. The UI renders whatever is in the table and the server resolves
objectives against events it produced itself. Adding one never means touching a React component.
Progress cannot be submitted by a client at all — there is no route that accepts it.

Four may be held at once. Repeatable contracts have cooldowns; one-off contracts are gone once
completed.

---

## The avatar

Assembled from primitives and animated procedurally — no rigged model, no animation graph. The walk
cycle's stride frequency follows actual speed, so a run reads as a run rather than a fast walk.

Customisable: suit, helmet, finish, visor, emblem, accessory, and two colours. Basic options are
free from the first second; **nothing about a basic avatar requires a wallet.** A handful of rare
cosmetics are craftable and can be taken on chain, but they are cosmetic in the strict sense — no
stats, no advantage.

The preview in the suit locker is the same component the world renders, so what you configure is
exactly what everyone else sees.

---

## Social

Nameplates with level and faction colour. Six emotes on a hold-to-open wheel. Station and area
chat, plus direct messages. Friend requests, with a mutual request treated as an acceptance rather
than a mirrored pair. A public profile at `/profile/<address>` readable by anyone, and leaderboards
by level, credits, contracts, ore mined and standing.

---

## What is deliberately absent

**No combat between players.** Combat contracts exist as flavour and hazard, not as PvP. Adding it
would mean latency compensation, hit registration and a whole second security surface, for a game
whose loop is mining and trade.

**No stamina or hunger.** Energy exists and drains while sprinting; that is the whole of it.

**No land NFTs.** Ownable station modules are on the roadmap, deliberately scoped small. Selling
speculative land before there is a game to put on it is the failure mode this project is arguing
against.

**No token.** Credits are a database number. If an on-chain token is ever warranted, it should be
designed against a working economy, not launched alongside one.
