# Web3

## Where the line is drawn

The single most consequential decision in this project is **what does not go on chain.**

A mining run produces a yield roughly every twelve seconds. Putting that on chain means a
transaction and a wallet prompt every twelve seconds, gas on every asteroid, and a game that stops
being a game. So it does not go on chain. Neither does movement, chat, XP, reputation, ordinary
resources, contract progress or crafting.

What does go on chain is the set of things a blockchain is genuinely better at than a database:

| On chain | Why |
|---|---|
| Bespoke hulls, one-off collectibles (ERC-721) | Provenance that outlives the game server |
| Rare modules, equipment, cosmetics (ERC-1155) | Transferable between players without our permission |
| Marketplace listings and settlement | Trade that does not require trusting us to honour it |
| Event and tournament rewards | Redeemable even if we stop running the game |

| Off chain | Why |
|---|---|
| Position, presence, chat | Would be absurd |
| XP, reputation, levels | Changes constantly, worthless to anyone else |
| Ordinary resources | Thousands of units per session |
| Contracts, crafting, refining | Server-authoritative by necessity |

The test for the boundary: **would a player care if this survived us?** A Quantum Shard in a
stockpile, no. An Aurora Prime hull awarded once and tradeable forever, yes.

---

## Contracts

### NovaAssets — ERC-721

Unique assets, with `ERC721Enumerable` kept deliberately. Enumerable costs gas on every transfer,
and the usual advice is to drop it and rely on an indexer. It is kept here because it lets a client
verify ownership **straight from the chain without trusting our own indexer**. For a project whose
entire premise is verifiable ownership, paying that gas is the point.

Only *provenance* is stored on chain: what the asset is, its rarity, which generation minted it,
and when. Gameplay statistics that change every session stay in the database — writing them here
would cost a transaction per mining run and would still have to be trusted from the server anyway.

### NovaItems — ERC-1155

Semi-fungible items. Every id must be **registered before it can be minted**. Without that step, a
compromised minter key could mint arbitrary unknown ids that the game would then have to decide how
to interpret. Requiring curation first keeps the item space closed, and per-id maximum supply is
enforced on every mint.

### NovaMarketplace

Three decisions carry most of the security weight:

**Escrow, not approval.** Listing moves the asset into the contract. A buyer can never pay for an
asset the seller quietly moved away, and cancelling returns it atomically. The alternative —
approve-and-transfer-on-buy — is cheaper to list with and leaves the buyer exposed.

**Pull payments.** Proceeds are credited to a balance and withdrawn separately. No ETH is pushed
during a purchase. This removes reentrancy as a category *and* the griefing vector of a seller
whose `receive` always reverts — a test deploys exactly that seller and asserts the sale still
settles, with only that seller's own withdrawal failing.

**A collection allowlist.** Only contracts an admin approved can be listed, so the market cannot be
used to sell a look-alike token from an attacker-deployed contract. A test deploys a `FakeAsset`
with the same name and symbol and asserts it is refused.

The fee is capped at 10% in the contract itself, regardless of admin intent, and splits between a
treasury and the reward vault by a configurable ratio. A fuzz test asserts that fee plus proceeds
always equals the price exactly, and that the contract never holds more than it owes.

### NovaRewardVault

The game decides *who* earned a reward — that is inherently off-chain knowledge. The vault makes
redemption trustless once that decision is made: a voucher is an EIP-712 signature binding
recipient, nonce, reward, deadline, **this contract's address and this chain id**.

The asymmetry that follows is the interesting part: a player never has to trust the server to
*deliver* a reward, only to *grant* it. Once signed, the voucher is redeemable by that recipient
alone, whatever the server does next.

The nonce is burned before any transfer, so a reentrant token callback cannot redeem twice. Only
the named recipient may redeem, so an intercepted voucher is worthless. An admin can invalidate
individual outstanding nonces — the escape hatch for a signing key that has to be rotated without
pausing redemption for everyone else.

### Roles

| Role | Held by | Can |
|---|---|---|
| `DEFAULT_ADMIN_ROLE` | Deployer / multisig | Grant and revoke every other role |
| `MINTER_ROLE` | Game server | Mint assets and items |
| `SIGNER_ROLE` | Game server | Sign reward vouchers |
| `CURATOR_ROLE` | Ops | Register item ids, set metadata URIs |
| `MARKET_ADMIN_ROLE` | Ops | Fees, allowlist, unwind a listing |
| `PAUSER_ROLE` | Ops | Emergency stop |

Separation is what bounds the damage from a stolen key. The minter key can mint curated items and
sign vouchers; it cannot transfer anyone's assets, change fees, alter the allowlist or pause
anything.

---

## The bridge

Taking an item on chain is a **move, not a copy**:

```
inventory (off chain)  ──burn──▶  NovaItems.mint  ──▶  indexer  ──▶  BlockchainAsset
```

The server holds `MINTER_ROLE` and mints only against an item the player already owns off chain,
burning that copy in the same operation. An item exists in the database or on the chain, never both.

**Bridge failures.** The burn commits before the chain call returns. If the transaction then fails
to send, the player has lost the item from their inventory. This is recorded as a pending
`ChainTransaction` and the endpoint reports the failure rather than swallowing it; reconciliation
is currently manual. Doing better means a two-phase reservation — mark the item reserved, mint,
then either burn or release — which is the right shape and is not implemented. It is listed in the
README's limitations because it is a real gap, not a theoretical one.

There is no path back off chain. Burning a token to return it to the off-chain inventory is
designed but not built.

---

## The indexer

The database holds a **mirror** of chain state, never a source of truth. It exists so the
marketplace can be browsed and an inventory rendered without a dozen RPC calls per page.

Two properties keep it honest:

- It is rebuilt purely from logs. Deleting every mirrored row and resetting the cursor reproduces
  the same state.
- It trails the head by a configurable confirmation depth, so a reorg does not leave a phantom sale
  in the listings table.

Anywhere ownership actually decides something, `verifyOwnership()` reads the chain directly rather
than trusting the mirror. The mirror can lag; the chain cannot.

The indexer also links a tokenised hull to its owner's hangar from the transfer log alone — buy an
Aurora on the marketplace and it appears in your hangar, and leaves the seller's, with no further
step.

### Keeping ids in agreement

The ERC-1155 token ids exist in two languages: `packages/shared/src/item-registry.ts` and
`contracts/script/Deploy.s.sol`. If they ever disagree, a player's on-chain item resolves to the
wrong game item.

Rather than trusting a comment, a test **reads the deploy script and compares it to the registry**.
Changing an id in one place without the other is a test failure.

---

## Transaction UX

The client sends its own transactions with the player's wallet. The server never holds a player key
and never acts on their behalf.

Every action reports the stage it is genuinely at:

```
Preparing → Waiting for wallet → Submitted → Confirming → Confirmed
                                                       ↘ Failed / Rejected
```

Each corresponds to something that actually happened — a simulation succeeded, a wallet returned a
hash, a receipt confirmed. **There is no path that reports success without a mined receipt.**

Calls are simulated before the wallet is asked to sign, which turns most reverts into a clear
message before a player is prompted at all. Errors are translated: a dismissed prompt says so
plainly and is not styled as a failure; insufficient funds, wrong network and contract custom
errors each get their own message. An unrecognised error is truncated rather than dumped.

Recording a submitted hash with the server lets the UI follow it. It proves nothing on its own —
the indexer decides what actually happened.

---

## Running without a chain

`RPC_URL` unset, or contract addresses unset, and the game is fully playable: mining, contracts,
crafting, the credit exchange, multiplayer. The on-chain panels report themselves unconfigured and
explain what would enable them.

This is deliberate. A Web3 game that cannot be evaluated without provisioning a wallet, a faucet
and an RPC endpoint is a Web3 game most people never evaluate.
