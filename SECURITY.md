# Security

## Threat model

The client is hostile. Not "might be" — is. It runs on a machine the player controls, in a browser
they can attach a debugger to, against an API they can call directly with curl. Every design
decision below starts from that assumption.

The assets being protected, in order of how much they matter:

1. **On-chain assets.** Irreversible if stolen. Real ownership.
2. **The economy.** Credits, resources and items. Inflation is a slow, hard-to-reverse harm.
3. **Progression.** XP, levels, faction standing.
4. **Accounts.** Sessions and the ability to act as someone else.
5. **Availability.** The server staying up under abuse.

Attackers considered: a player with devtools; a player with a scripted client; a player with two
accounts colluding; someone who has stolen a session token; someone who has stolen the server's
minter key.

Explicitly out of scope: a compromised wallet (nothing here can help), a malicious browser
extension, and physical access to the server.

---

## 1. Authentication

**Sign-In with Ethereum (EIP-4361).** A signature over a message, not a transaction. No gas, no
approval, nothing on chain, no private key anywhere near the application.

Four checks make a signature usable as a login, and dropping any one turns a signature captured
elsewhere into a session here:

| Check | Without it |
|---|---|
| Signature recovers to the named address | Anyone signs in as anyone |
| Nonce was issued here, unused, unexpired | A captured signature replays forever |
| Domain matches this deployment | A signature from another site logs in here |
| Chain id matches | A signature intended for another network is accepted |

The nonce is **consumed before the signature is verified**, with a conditional update:

```ts
const consumed = await db.authNonce.updateMany({
  where: { nonce, address, usedAt: null, expiresAt: { gt: new Date() } },
  data: { usedAt: new Date() },
});
if (consumed.count !== 1) throw new GameError('unauthorized', …);
```

Two requests carrying the same signature race for one row; exactly one wins. Verifying first and
consuming after would leave a window in which both succeed.

The SIWE parser is strict by design. A permissive parser is a security bug: an attacker who can
make the server read a different address, chain or nonce than the wallet displayed converts one
signature into a session for another account. Anything unexpected returns `null` rather than a
best guess. *(`packages/web3/src/siwe.ts`, tested in `packages/web3/test`.)*

**Sessions.** A token is `<id>.<secret>.<hmac>`. The HMAC lets the server reject a forgery without
a database round trip; only the SHA-256 of the whole token is stored, so a database leak yields no
usable sessions. Tokens are httpOnly cookies (`SameSite=None; Secure` in production), with a bearer
fallback for split-origin deployments held in memory for the tab's lifetime — deliberately not
`localStorage`, so it cannot be read back by script injected on a later visit.

---

## 2. The economy

### Nothing is granted on a client's word

There is no endpoint that accepts "I mined 500 platinum", "I completed this mission" or "my level
is 40". Mission progress cannot be submitted at all: it is derived server-side from events the
server itself produced.

### Mining, in detail

The mining minigame is the one place a client reports something that affects a payout, so it is
worth spelling out exactly how much that is worth.

The client reports `holdTicks` — how many 10 Hz ticks it held the resonance band. That number is:

1. **Rejected at the schema** if outside `[0, 10000]`, non-integer or non-finite.
2. **Clamped by the engine** to `ceil(elapsedSec × tickHz)`, where `elapsedSec` is set by the
   server, not reported by the client.
3. **Converted to a bounded multiplier** between 0.55 and 1.45.

So a client claiming a perfect score it did not earn gains at most 45% over a failed run. A client
claiming an impossible score gains nothing at all over a perfect one. And critically, the
multiplier scales amounts only — *which* resources drop is decided from a server seed the client
never sees, so skill cannot conjure a Quantum Shard.

Beyond that: each asteroid may be worked once per expedition (replaying the request is a 409), the
haul is capped by cargo capacity with the overflow discarded rather than granted, and ore becomes
real only when the expedition is banked — so a disconnect mid-run loses the trip rather than
duplicating it.

### Credits

Every movement goes through one function, inside the caller's transaction, and leaves a ledger row.
Debits use a conditional update, so a balance cannot go negative and two concurrent spends cannot
both succeed. `replayBalance()` reconstructs any balance from the journal; a test asserts the cache
and the journal agree after concurrent activity.

### Duplication

The general shape: **an item exists in exactly one place at a time**, and the move is atomic.

| Operation | How duplication is prevented |
|---|---|
| Listing an item | Removed from inventory into escrow in the same transaction as the listing |
| Buying a listing | Listing closed by conditional update *before* any credits or items move |
| Fitting a module | Removed from inventory and written to the slot atomically; the displaced one returns |
| Minting on chain | The off-chain copy is burned in the same operation |
| Crafting | Inputs debited as the bench is claimed; the same ore cannot fund two jobs |
| Claiming a mission | Status moves `complete → claimed` by conditional update |

Each of these has a test that fires genuinely concurrent requests and asserts exactly one succeeds.

### Market manipulation

Listing prices are bounded to 0.1×–25× the item's catalogue value and to an absolute ceiling.
Open listings per player are capped. A posting fee makes spam cost something. Wash trading between
two accounts still transfers value, but the fee makes it lossy and the ledger makes it visible.

---

## 3. Movement

Movement is **soft-authoritative**, and it is worth being precise about what that does and does not
buy.

The client simulates locally so walking feels immediate. The server re-checks every reported
position against the *same* collision geometry, and rejects or corrects:

| Verdict | Cause |
|---|---|
| `rejected` | Non-finite coordinates, outside the station, or a jump beyond the teleport threshold |
| `corrected` | Faster than possible for the elapsed time, inside geometry, above the jump arc, below the floor |

Repeated corrections disconnect the client. The server does **not** re-simulate movement from raw
input — it validates outcomes rather than reproducing them. That is a deliberate trade: movement
grants nothing, so the worst a perfect movement cheat achieves is standing somewhere odd. Anything
that *does* grant something — entering an area, using a terminal, mining a rock — is separately
range-checked against the server's own copy of the geometry.

Area entry checks the level gate *and* that the claimed position is inside the area's rectangle.
Terminal use checks the distance to that terminal. Neither trusts the movement stream.

---

## 4. The realtime gateway

| Vector | Mitigation |
|---|---|
| Unauthenticated socket | Session resolved before the player is admitted; otherwise closed with 4401 |
| Oversized frames | 4 KB payload cap at the socket, 2 KB check before parsing |
| Malformed frames | Discriminated-union schema; anything unrecognised is dropped, not guessed |
| Message flooding | Per-connection, per-message-type token buckets; sustained abuse disconnects |
| Spoofing another player | Every broadcast is stamped with the server's own record of who sent it |
| Chat injection | Length-bounded, control characters rejected, rendered as text |
| Multiple bodies | One live connection per account; a second replaces the first |
| Idle connections | Heartbeat with a 60s idle timeout |
| Snapshot scraping | Interest management means a client only ever receives players within 70m |

---

## 5. Smart contracts

| Concern | Mitigation |
|---|---|
| Unauthorised minting | `MINTER_ROLE` only; no public mint path exists |
| Unknown item ids | ERC-1155 ids must be curated before they can be minted |
| Supply inflation | Per-id maximum supply, enforced on every mint |
| Reentrancy | `nonReentrant` on every value-moving function, effects strictly before interactions |
| Push-payment griefing | Pull payments: proceeds are credited, never sent, during a purchase |
| Fake collections | Marketplace allowlist — only curated contracts can be listed |
| Seller rug-pull | Escrow: the asset is held by the marketplace, not merely approved |
| Fee abuse | `MAX_FEE_BPS` caps the fee at 10% regardless of admin intent |
| Signature replay | EIP-712 domain binds chain id *and* contract; nonces are single-use |
| Voucher theft | Only the named recipient may redeem |
| Key compromise | Roles are revocable; individual nonces can be invalidated; every contract pauses |

The marketplace test suite includes a contract that reenters `buy` from an ERC-721 callback and
asserts it is rejected, a seller whose `receive` always reverts (the sale still settles; only that
seller's withdrawal fails), and fuzz invariants that value is never created or destroyed and that
the contract never holds more than it owes.

### What a stolen minter key would cost

It could mint unlimited items of already-curated ids, and sign reward vouchers. It could **not**
transfer anyone's assets, change fees, alter the allowlist or pause anything — those are separate
roles. Recovery is to revoke `MINTER_ROLE`, pause, and re-issue. The role separation exists
precisely so the answer to that question is bounded.

---

## 6. API hardening

Zod validation on every request body, query and parameter; unknown fields rejected rather than
ignored. Rate limiting keyed by session where there is one, so several players behind one NAT are
not throttled as one client — and much harder on the sign-in endpoints, the only unauthenticated
routes that write. Helmet security headers. A CORS allowlist. A 64 KB body limit. Errors are typed
domain errors with stable codes; internal messages appear only outside production.

Logs redact authorization headers, cookies, signatures and message bodies. An address is loggable;
a signature is not.

---

## 7. What is deliberately not solved

- **Collusion between two accounts** transfers value legitimately. Fees make it lossy; the ledger
  makes it visible after the fact. Nothing prevents it outright.
- **A stolen session token** is usable until it expires. There is no device binding.
- **Automation.** A scripted client can play the minigame perfectly. That is worth 45%, which is
  the point of the bound — it is a skill expression, not a gate.
- **Denial of service** beyond application rate limiting is left to infrastructure.
- **Front-running on-chain purchases** is inherent to a public mempool.

---

## Reporting

Open a private security advisory on the repository. Please do not open a public issue for anything
that affects live assets.
