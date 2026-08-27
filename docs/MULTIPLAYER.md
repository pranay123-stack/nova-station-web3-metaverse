# Multiplayer

## Shape

```
  client                          server                        other clients
 ────────                        ────────                       ─────────────
 stepCharacter (every frame)
        │
        │ 10 Hz, only when the pose changed
        ▼
   { t:'move', p, y, s, ts } ──▶ validateMovement
                                      │ accepted → Room state
                                      │ corrected/rejected → { t:'correction' }
                                      ▼
                                 Room.snapshotFor(viewer)  ──▶ { t:'snapshot' } 10 Hz
                                                                     │
                                                        RemoteBuffer.ingest
                                                                     │
                                                   sampled every frame, 150ms behind
```

One process holds every connected player in memory. The server is authoritative over the world
state it broadcasts; the client is authoritative over nothing.

---

## Wire format

JSON, one object per frame, discriminated on `t`. A packed binary encoding would be smaller, but
the snapshot rate and position quantisation do far more for bandwidth than the encoding would, and
JSON buys the ability to read a live session in browser devtools. That trade is worth making at
this scale; it would not be at ten thousand concurrent players.

### Client → server

| Type | Payload | Rate limit (per second / burst) |
|---|---|---|
| `move` | position, yaw, movement state, client timestamp | 15 / 30 |
| `emote` | one of six emotes | 2 / 4 |
| `chat` | channel, text, optional recipient | 1 / 5 |
| `area` | current sector | 2 / 6 |
| `ping` | client timestamp | 2 / 4 |

Every frame is parsed by a Zod discriminated union. Anything that does not match — an unknown
type, a non-finite coordinate, a movement state that does not exist — is discarded and the client
is told, without closing the connection. Frames over 2 KB are dropped before parsing; the socket
itself caps payloads at 4 KB.

### Server → client

`welcome`, `snapshot`, `join`, `leave`, `emote`, `chat`, `correction`, `pong`, `presence`,
`notice`, `error`.

---

## Bandwidth

Three mechanisms, in order of how much they save:

**Silence when still.** The client sends `move` only when the pose actually changed by more than a
threshold. A player standing at a terminal reading a mission brief produces zero traffic — which is
most players, much of the time, and by far the biggest saving available.

**Interest management.** Snapshots are built per recipient and contain only players within 70m.
Twenty commanders spread across the station cost each of them two or three entries, not twenty.
It also means a client cannot scrape the position of a player it could not see.

**Quantisation.** Positions to centimetres, angles to milliradians. A snapshot entry is ~90 bytes
of JSON; a busy room at 10 Hz is a few KB/s per client.

At the snapshot rate of 10 Hz, a player with five others in range receives roughly 4.5 KB/s.

---

## Interpolation

Remote bodies are drawn **150 ms in the past** — one and a half snapshot intervals. Far enough back
that there is always a newer snapshot to interpolate towards, close enough that other players do
not feel laggy. A dropped packet is absorbed without a visible stall.

The buffer keeps twelve samples per player and handles four cases explicitly:

| Case | Behaviour |
|---|---|
| No samples yet | Return null; the renderer hides the body rather than parking it at the origin |
| One sample, or render time ahead of all samples | Hold at the newest — never extrapolate into a guess |
| Render time between two samples | Linear interpolate; yaw takes the shortest path around the compass |
| Gap larger than 12m between samples | Snap; sliding a body across a room reads worse than a teleport |

It also reports the speed implied by the two samples, which drives the walk cycle — so a remote
player's legs move at the rate they are actually travelling rather than at a fixed cadence.

This lives entirely outside React. `useFrame` samples it directly; a store would re-render the
scene sixty times a second.

---

## Movement validation

For each reported position the server computes, against the same geometry the client used:

```
non-finite or outside station bounds  → rejected
distance > 24m in one report          → rejected  (teleport)
distance > speed × dt × 1.6 + 0.5m    → corrected (speed)
body intersects a solid               → corrected (inside geometry)
more than 4.5m above local ground     → corrected (flying)
more than 3m below local ground       → corrected (below floor)
otherwise                             → accepted
```

The tolerances are generous on purpose. A correction on a legitimately laggy frame is a worse
experience than letting an implausible-but-harmless position through, and movement grants nothing.
Sixty corrections in a session closes the connection.

Two details that were bugs first:

**The first report has no baseline.** `lastMoveAt` is initialised a second in the past, so a player
who moved between connecting and their first update is not corrected for a delta measured against
a near-zero interval.

**Steppable geometry is not an obstruction.** The validator uses the same step-height rule as the
controller, so a kerb the player walks over does not read as "inside geometry".

A correction is eased in over a few frames rather than snapped, which reads as a stumble instead of
a glitch.

---

## Connection lifecycle

**Joining.** Session resolved from cookie or token; a socket without one is closed with 4401. The
player's identity and avatar are read once, a short session id is generated (never the wallet
address — that is sent separately, deliberately, so nameplates and chat can show it but the
snapshot stream stays small), and a `PlayerSession` row records the visit.

**One body per account.** A second connection for the same account closes the first with 4001, and
the client reports "You signed in from another window" rather than reconnecting into a fight.

**Reconnection.** Exponential backoff from 800 ms to 15 s, up to eight attempts. Authentication
failures (4401/4403) and displacement (4001) do not retry — retrying cannot help, and the UI says
what happened instead of spinning.

**Heartbeat.** A ping every 15 s; 60 s of silence closes the connection. Latency comes from the
application-level `ping`/`pong` round trip and is shown in the HUD.

**Leaving.** The play session is closed, its duration added to lifetime playtime, and accumulated
walking distance flushed — distance is buffered in memory and written every 30 s rather than per
frame, because it feeds an achievement, not a balance.

---

## Chat

Three channels: `station` (everyone), `area` (the current sector), `direct` (one recipient, who
must be online). All are persisted, length-bounded to 240 characters, and rejected outright if they
contain control characters — the usual vector for spoofing a chat line or breaking a log parser.

Opening the composer suspends movement input, so pressing "W" writes a W rather than walking the
commander into a wall mid-sentence.

---

## Scaling beyond one process

The current design is a single authoritative process, which is the right shape for one station and
is honest about its ceiling. What it would take to go further:

1. **Shared presence.** `Room` is in-memory. A Redis-backed store (already in the compose file)
   would let several gateways serve one world.
2. **Sticky or sharded routing.** Either pin a player to a gateway, or shard by sector — the
   station's seven sectors are a natural boundary, and interest management already means most players
   never need to see across one.
3. **A tick loop.** Snapshots are currently built per recipient on a timer. At scale this becomes a
   fixed simulation tick with delta compression against each client's last acknowledged snapshot.
4. **Binary framing.** Worth it once the JSON overhead dominates; not before.

None of these change the security model, because the server is already the only writer.
