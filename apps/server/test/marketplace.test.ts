import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ECONOMY } from '@nova/game-data';
import {
  api,
  giveCredits,
  giveResources,
  resetDatabase,
  signIn,
  testApp,
  type TestPlayer,
} from './helpers.js';
import { prisma } from '../src/db/client.js';
import { replayBalance } from '../src/services/ledger.js';

async function creditsOf(userId: string): Promise<number> {
  const user = await prisma().user.findUniqueOrThrow({
    where: { id: userId },
    select: { credits: true },
  });
  return Number(user.credits);
}

async function inventoryCount(userId: string, defId: string, kind = 'module'): Promise<number> {
  const row = await prisma().inventoryItem.findUnique({
    where: { userId_kind_defId: { userId, kind, defId } },
    select: { amount: true },
  });
  return row?.amount ?? 0;
}

describe('marketplace', () => {
  let seller: TestPlayer;
  let buyer: TestPlayer;

  beforeAll(async () => {
    await testApp();
  });

  beforeEach(async () => {
    await resetDatabase();
    seller = await signIn(61);
    buyer = await signIn(62);
    await giveCredits(seller.userId, 100_000);
    await giveCredits(buyer.userId, 100_000);
  });

  it('quotes station broker prices with a spread in the station favour', async () => {
    const { body } = await api<{ prices: { resource: string; buy: number; sell: number }[] }>(
      null,
      'GET',
      '/api/marketplace/broker',
    );
    for (const row of body.prices) {
      expect(row.buy, row.resource).toBeGreaterThan(row.sell);
    }
  });

  it('sells ore to the broker and removes it from the inventory', async () => {
    await giveResources(seller.userId, [{ defId: 'iron', amount: 100 }]);
    const before = await creditsOf(seller.userId);

    const { status, body } = await api<{ result: { credits: number } }>(
      seller,
      'POST',
      '/api/marketplace/broker/sell',
      { resource: 'iron', amount: 100 },
    );
    expect(status).toBe(200);
    expect(await creditsOf(seller.userId)).toBe(before + body.result.credits);
    expect(await inventoryCount(seller.userId, 'iron', 'resource')).toBe(0);
  });

  it('refuses to sell ore the player does not hold', async () => {
    const { status } = await api(seller, 'POST', '/api/marketplace/broker/sell', {
      resource: 'platinum',
      amount: 10,
    });
    expect(status).toBe(400);
  });

  it('escrows an item when it is listed', async () => {
    await giveResources(seller.userId, [{ defId: 'ion_thruster', amount: 1, kind: 'module' }]);

    const { status } = await api(seller, 'POST', '/api/marketplace/list', {
      kind: 'module',
      defId: 'ion_thruster',
      amount: 1,
      price: 3000,
    });
    expect(status).toBe(200);
    // Escrowed: the seller no longer holds it, so it cannot be listed twice.
    expect(await inventoryCount(seller.userId, 'ion_thruster')).toBe(0);
  });

  it('refuses to list an item the seller does not own', async () => {
    const { status } = await api(seller, 'POST', '/api/marketplace/list', {
      kind: 'module',
      defId: 'harmonic_extractor',
      amount: 1,
      price: 1000,
    });
    expect(status).toBe(400);
  });

  it('refuses a price far outside the reference range', async () => {
    await giveResources(seller.userId, [{ defId: 'ion_thruster', amount: 2, kind: 'module' }]);
    const tooHigh = await api<{ error: { code: string } }>(
      seller,
      'POST',
      '/api/marketplace/list',
      { kind: 'module', defId: 'ion_thruster', amount: 1, price: 99_000_000 },
    );
    expect(tooHigh.status).toBe(400);
    expect(tooHigh.body.error.code).toBe('validation_failed');

    const tooLow = await api(seller, 'POST', '/api/marketplace/list', {
      kind: 'module',
      defId: 'ion_thruster',
      amount: 1,
      price: 1,
    });
    expect(tooLow.status).toBe(400);
  });

  it('completes a sale, charging the fee and paying the seller the rest', async () => {
    await giveResources(seller.userId, [{ defId: 'ion_thruster', amount: 1, kind: 'module' }]);
    const listing = await api<{ listing: { id: string } }>(seller, 'POST', '/api/marketplace/list', {
      kind: 'module',
      defId: 'ion_thruster',
      amount: 1,
      price: 3000,
    });

    const sellerBefore = await creditsOf(seller.userId);
    const buyerBefore = await creditsOf(buyer.userId);

    const purchase = await api<{ result: { paid: number; fee: number; sellerProceeds: number } }>(
      buyer,
      'POST',
      '/api/marketplace/buy',
      { listingId: listing.body.listing.id },
    );
    expect(purchase.status).toBe(200);
    expect(purchase.body.result.paid).toBe(3000);
    expect(purchase.body.result.fee).toBe(
      Math.floor((3000 * ECONOMY.marketFeeBps) / 10_000),
    );
    expect(purchase.body.result.sellerProceeds).toBe(3000 - purchase.body.result.fee);

    expect(await creditsOf(buyer.userId)).toBe(buyerBefore - 3000);
    expect(await creditsOf(seller.userId)).toBe(sellerBefore + purchase.body.result.sellerProceeds);
    expect(await inventoryCount(buyer.userId, 'ion_thruster')).toBe(1);
  });

  it('refuses to buy your own listing', async () => {
    await giveResources(seller.userId, [{ defId: 'ion_thruster', amount: 1, kind: 'module' }]);
    const listing = await api<{ listing: { id: string } }>(seller, 'POST', '/api/marketplace/list', {
      kind: 'module',
      defId: 'ion_thruster',
      amount: 1,
      price: 3000,
    });
    const { status } = await api(seller, 'POST', '/api/marketplace/buy', {
      listingId: listing.body.listing.id,
    });
    expect(status).toBe(403);
  });

  it('sells a listing exactly once, however many buyers race for it', async () => {
    await giveResources(seller.userId, [{ defId: 'ion_thruster', amount: 1, kind: 'module' }]);
    const listing = await api<{ listing: { id: string } }>(seller, 'POST', '/api/marketplace/list', {
      kind: 'module',
      defId: 'ion_thruster',
      amount: 1,
      price: 3000,
    });

    const third = await signIn(63);
    await giveCredits(third.userId, 100_000);

    const results = await Promise.all([
      api(buyer, 'POST', '/api/marketplace/buy', { listingId: listing.body.listing.id }),
      api(third, 'POST', '/api/marketplace/buy', { listingId: listing.body.listing.id }),
      api(buyer, 'POST', '/api/marketplace/buy', { listingId: listing.body.listing.id }),
    ]);
    expect(results.filter((result) => result.status === 200)).toHaveLength(1);

    const copies =
      (await inventoryCount(buyer.userId, 'ion_thruster')) +
      (await inventoryCount(third.userId, 'ion_thruster'));
    expect(copies).toBe(1);
  });

  it('returns the escrowed item when a listing is cancelled', async () => {
    await giveResources(seller.userId, [{ defId: 'ion_thruster', amount: 1, kind: 'module' }]);
    const listing = await api<{ listing: { id: string } }>(seller, 'POST', '/api/marketplace/list', {
      kind: 'module',
      defId: 'ion_thruster',
      amount: 1,
      price: 3000,
    });

    const cancelled = await api(seller, 'POST', '/api/marketplace/cancel', {
      listingId: listing.body.listing.id,
    });
    expect(cancelled.status).toBe(200);
    expect(await inventoryCount(seller.userId, 'ion_thruster')).toBe(1);

    const purchase = await api(buyer, 'POST', '/api/marketplace/buy', {
      listingId: listing.body.listing.id,
    });
    expect(purchase.status).toBe(409);
  });

  it('refuses to cancel someone else listing', async () => {
    await giveResources(seller.userId, [{ defId: 'ion_thruster', amount: 1, kind: 'module' }]);
    const listing = await api<{ listing: { id: string } }>(seller, 'POST', '/api/marketplace/list', {
      kind: 'module',
      defId: 'ion_thruster',
      amount: 1,
      price: 3000,
    });
    const { status } = await api(buyer, 'POST', '/api/marketplace/cancel', {
      listingId: listing.body.listing.id,
    });
    expect(status).toBe(404);
  });

  it('caps how many listings one player may hold open', async () => {
    await giveResources(seller.userId, [
      { defId: 'ion_thruster', amount: ECONOMY.maxListingsPerPlayer + 2, kind: 'module' },
    ]);
    let rejected = 0;
    for (let i = 0; i < ECONOMY.maxListingsPerPlayer + 2; i += 1) {
      const { status } = await api(seller, 'POST', '/api/marketplace/list', {
        kind: 'module',
        defId: 'ion_thruster',
        amount: 1,
        price: 3000,
      });
      if (status !== 200) rejected += 1;
    }
    expect(rejected).toBeGreaterThanOrEqual(2);
  });

  it('browses, filters and sorts open listings', async () => {
    await giveResources(seller.userId, [
      { defId: 'ion_thruster', amount: 1, kind: 'module' },
      { defId: 'deflector_i', amount: 1, kind: 'module' },
    ]);
    await api(seller, 'POST', '/api/marketplace/list', {
      kind: 'module',
      defId: 'ion_thruster',
      amount: 1,
      price: 5000,
    });
    await api(seller, 'POST', '/api/marketplace/list', {
      kind: 'module',
      defId: 'deflector_i',
      amount: 1,
      price: 2000,
    });

    const ascending = await api<{ listings: { price: string }[] }>(
      null,
      'GET',
      '/api/marketplace?sort=price_asc',
    );
    expect(ascending.body.listings.map((row) => Number(row.price))).toEqual([2000, 5000]);

    const filtered = await api<{ listings: { defId: string }[] }>(
      null,
      'GET',
      '/api/marketplace?rarity=uncommon',
    );
    expect(filtered.body.listings.every((row) => row.defId === 'ion_thruster')).toBe(true);
  });

  it('keeps both ledgers consistent across a full trade', async () => {
    await giveResources(seller.userId, [{ defId: 'ion_thruster', amount: 1, kind: 'module' }]);
    const listing = await api<{ listing: { id: string } }>(seller, 'POST', '/api/marketplace/list', {
      kind: 'module',
      defId: 'ion_thruster',
      amount: 1,
      price: 3000,
    });
    await api(buyer, 'POST', '/api/marketplace/buy', { listingId: listing.body.listing.id });

    const db = prisma();
    for (const player of [seller, buyer]) {
      const user = await db.user.findUniqueOrThrow({
        where: { id: player.userId },
        select: { credits: true },
      });
      expect(await replayBalance(db, player.userId)).toBe(user.credits);
    }
  });

  it('reports the chain configuration honestly when nothing is deployed', async () => {
    const { body } = await api<{ configured: boolean; mintingAvailable: boolean }>(
      null,
      'GET',
      '/api/chain/config',
    );
    expect(typeof body.configured).toBe('boolean');
    expect(typeof body.mintingAvailable).toBe('boolean');
  });
});
