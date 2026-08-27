#!/usr/bin/env node
/**
 * End-to-end check of the on-chain path, against a local anvil node.
 *
 * The Foundry suite proves the contracts behave; the Playwright suite proves the
 * game plays. This proves the seam between them: that a real transaction is
 * indexed into the game's own marketplace, that a purchase moves ownership on
 * chain, and that the indexer catches up.
 *
 * Prerequisites:
 *   pnpm chain:node            anvil on 8545
 *   pnpm chain:deploy:local    contracts deployed
 *   the game server running with those addresses and a minter key
 *
 * Then:  pnpm --filter @nova/server verify:chain
 *
 * The keys below are anvil's well-known development accounts. They are public
 * and must never be used anywhere real.
 */

import { createPublicClient, createWalletClient, http, parseEther } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { NovaItemsAbi, NovaMarketplaceAbi } from '@nova/shared';

const API = 'http://localhost:4300';
const RPC = 'http://127.0.0.1:8545';
const ITEMS = '0x95401dc811bb5740090279Ba06cfA8fcF6113778';
const MARKET = '0x70e0bA845a1A0F2DA3359C97E0285013525FFC49';
const chain = { id: 31337, name: 'anvil', nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: [RPC] } } };

const seller = privateKeyToAccount(`0x${(0xbeef01).toString(16).padStart(64, '0')}`);
const buyer = privateKeyToAccount(`0x${(0xbeef02).toString(16).padStart(64, '0')}`);
const faucet = privateKeyToAccount('0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80');

const pub = createPublicClient({ chain, transport: http(RPC) });
const wallet = (account) => createWalletClient({ account, chain, transport: http(RPC) });

const post = async (path, body, token) => {
  const res = await fetch(API + path, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body ?? {}) });
  return { status: res.status, body: await res.json().catch(() => null) };
};
const get = async (path, token) => {
  const res = await fetch(API + path, { headers: token ? { authorization: `Bearer ${token}` } : {} });
  return { status: res.status, body: await res.json().catch(() => null) };
};
const signIn = async (account) => {
  const address = account.address.toLowerCase();
  const n = await post('/api/auth/nonce', { address });
  const signature = await account.signMessage({ message: n.body.message });
  const v = await post('/api/auth/verify', { message: n.body.message, signature });
  return v.body.token;
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// Fund both wallets from anvil's faucet account.
for (const who of [seller, buyer]) {
  const hash = await wallet(faucet).sendTransaction({ to: who.address, value: parseEther('5') });
  await pub.waitForTransactionReceipt({ hash });
}
console.log('funded seller and buyer');

const buyerToken = await signIn(buyer);
console.log('buyer signed in');

// 0. Mint the seller a token so the script can be re-run. The faucet account
//    is the deployer and holds MINTER_ROLE on a local deployment.
let hash = await wallet(faucet).writeContract({ address: ITEMS, abi: NovaItemsAbi, functionName: 'mint', args: [seller.address, 1n, 1n] });
await pub.waitForTransactionReceipt({ hash });
console.log('minted a token to the seller');

// 1. Seller approves the marketplace, then lists the token for 0.25 ETH.
hash = await wallet(seller).writeContract({ address: ITEMS, abi: NovaItemsAbi, functionName: 'setApprovalForAll', args: [MARKET, true] });
await pub.waitForTransactionReceipt({ hash });
hash = await wallet(seller).writeContract({ address: MARKET, abi: NovaMarketplaceAbi, functionName: 'list', args: [ITEMS, 1n, 1n, parseEther('0.25')] });
const listReceipt = await pub.waitForTransactionReceipt({ hash });
console.log('listed on chain, block', listReceipt.blockNumber);

// 2. The indexer should mirror it into the game's marketplace.
let listing = null;
for (let i = 0; i < 12; i += 1) {
  await wait(1500);
  const res = await get('/api/marketplace?onChainOnly=true&sort=newest');
  if (res.body.listings.length > 0) { listing = res.body.listings[0]; break; }
}
console.log('indexed listing:', listing ? `${listing.name} for ${listing.price} wei (${listing.currency})` : 'NOT INDEXED');

// 3. Buyer purchases it on chain.
if (listing) {
  hash = await wallet(buyer).writeContract({ address: MARKET, abi: NovaMarketplaceAbi, functionName: 'buy', args: [BigInt(listing.chain.listingId)], value: BigInt(listing.price) });
  const buyReceipt = await pub.waitForTransactionReceipt({ hash });
  console.log('purchased on chain:', buyReceipt.status, 'block', buyReceipt.blockNumber);

  // 4. Ownership is verified against the chain itself, not our mirror.
  const onChainBalance = await pub.readContract({ address: ITEMS, abi: NovaItemsAbi, functionName: 'balanceOf', args: [buyer.address, 1n] });
  console.log('CHAIN SAYS buyer owns:', onChainBalance.toString());

  // 5. And the indexer catches up: the listing closes and the asset moves.
  //    Poll on the listing closing, not on the buyer simply owning something —
  //    they may already own one from an earlier run.
  for (let i = 0; i < 15; i += 1) {
    await wait(1500);
    const open = await get('/api/marketplace?onChainOnly=true&sort=newest');
    const stillOpen = open.body.listings.some((l) => l.id === listing.id);
    if (!stillOpen) {
      const assets = await get('/api/chain/assets', buyerToken);
      const owned = assets.body.assets.find((a) => a.defId === listing.defId);
      console.log('INDEXER: listing closed, buyer holds', owned ? owned.amount : 0);
      break;
    }
    if (i === 14) console.log('indexer did not reflect the sale in time');
  }
}
