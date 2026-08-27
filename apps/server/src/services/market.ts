import {
  ECONOMY,
  RESOURCES,
  type Rarity,
  type ResourceId,
} from '@nova/game-data';
import {
  computeFee,
  describeItem,
  feeDiscountFor,
  isPriceSane,
  stationBuyPrice,
  stationSellPrice,
} from '@nova/game-engine';
import { GameError, type ListingDto } from '@nova/shared';
import type { Db } from '../db/client.js';
import { addItems, removeItems } from './inventory.js';
import { moveCredits } from './ledger.js';
import { events, recordEvent } from './events.js';
import { readStanding } from './progression.js';

export interface ListingQuery {
  readonly category?: string;
  readonly rarity?: Rarity;
  readonly sort: 'price_asc' | 'price_desc' | 'newest' | 'rarity';
  readonly onChainOnly: boolean;
  readonly limit: number;
}

function listingDto(row: {
  id: string;
  kind: string;
  defId: string;
  amount: number;
  price: bigint;
  currency: string;
  createdAt: Date;
  chainListingId: string | null;
  collection: string | null;
  tokenId: string | null;
  standard: string | null;
  seller: { address: string; displayName: string };
}): ListingDto {
  const info = describeItem({
    kind: row.kind as 'resource' | 'module' | 'equipment' | 'cosmetic',
    id: row.defId,
  });
  return {
    id: row.id,
    kind: row.kind as ListingDto['kind'],
    defId: row.defId,
    name: info?.name ?? row.defId,
    rarity: info?.rarity ?? 'common',
    amount: row.amount,
    price: row.price.toString(),
    currency: row.currency as 'credits' | 'eth',
    seller: row.seller.address,
    sellerName: row.seller.displayName,
    createdAt: row.createdAt.toISOString(),
    onChain: row.chainListingId !== null,
    chain: row.chainListingId
      ? {
          listingId: row.chainListingId,
          collection: row.collection ?? '',
          tokenId: row.tokenId ?? '',
          standard: (row.standard as 'erc721' | 'erc1155') ?? 'erc1155',
        }
      : null,
  };
}

const LISTING_SELECT = {
  id: true,
  kind: true,
  defId: true,
  amount: true,
  price: true,
  currency: true,
  createdAt: true,
  chainListingId: true,
  collection: true,
  tokenId: true,
  standard: true,
  seller: { select: { address: true, displayName: true } },
} as const;

export async function browseListings(db: Db, query: ListingQuery): Promise<ListingDto[]> {
  const rows = await db.marketplaceListing.findMany({
    where: {
      status: 'open',
      ...(query.category ? { kind: query.category } : {}),
      ...(query.onChainOnly ? { chainListingId: { not: null } } : {}),
    },
    orderBy:
      query.sort === 'price_asc'
        ? { price: 'asc' }
        : query.sort === 'price_desc'
          ? { price: 'desc' }
          : { createdAt: 'desc' },
    take: query.limit,
    select: LISTING_SELECT,
  });

  let listings = rows.map(listingDto);
  if (query.rarity) listings = listings.filter((row) => row.rarity === query.rarity);
  if (query.sort === 'rarity') {
    const order: Rarity[] = ['legendary', 'epic', 'rare', 'uncommon', 'common'];
    listings = [...listings].sort((a, b) => order.indexOf(a.rarity) - order.indexOf(b.rarity));
  }
  return listings;
}

export async function myListings(db: Db, userId: string): Promise<ListingDto[]> {
  const rows = await db.marketplaceListing.findMany({
    where: { sellerId: userId, status: 'open' },
    orderBy: { createdAt: 'desc' },
    select: LISTING_SELECT,
  });
  return rows.map(listingDto);
}

/**
 * Lists an off-chain item for credits.
 *
 * The item leaves the seller's inventory into escrow the moment the listing
 * opens, exactly as the on-chain marketplace escrows a token. Without that, a
 * seller could list an item ten times and sell it ten times over.
 */
export async function createCreditListing(
  db: Db,
  userId: string,
  input: { kind: string; defId: string; amount: number; price: number },
): Promise<ListingDto> {
  const info = describeItem({
    kind: input.kind as 'resource' | 'module' | 'equipment' | 'cosmetic',
    id: input.defId,
  });
  if (!info) throw new GameError('not_found', 'No such item.');

  const reference = Math.max(1, info.baseValue) * input.amount;
  if (!isPriceSane(input.price, reference)) {
    throw new GameError('validation_failed', 'That price is outside the allowed range.', {
      reference,
      min: Math.ceil(reference * ECONOMY.minPriceMultiplier),
      max: Math.floor(reference * ECONOMY.maxPriceMultiplier),
    });
  }

  return db.$transaction(async (tx) => {
    const open = await tx.marketplaceListing.count({ where: { sellerId: userId, status: 'open' } });
    if (open >= ECONOMY.maxListingsPerPlayer) {
      throw new GameError('conflict', 'You have too many open listings.');
    }

    await removeItems(tx, userId, [
      {
        kind: input.kind as 'resource' | 'module' | 'equipment' | 'cosmetic',
        defId: input.defId,
        amount: input.amount,
      },
    ]);
    await moveCredits(tx, {
      userId,
      kind: 'listing_fee',
      delta: -BigInt(ECONOMY.listingFeeCredits),
      reason: `Listed ${input.amount} x ${info.name}`,
    });

    const row = await tx.marketplaceListing.create({
      data: {
        sellerId: userId,
        kind: input.kind,
        defId: input.defId,
        amount: input.amount,
        price: BigInt(input.price),
        currency: 'credits',
        status: 'open',
      },
      select: LISTING_SELECT,
    });
    return listingDto(row);
  });
}

export async function cancelCreditListing(db: Db, userId: string, listingId: string): Promise<void> {
  await db.$transaction(async (tx) => {
    const row = await tx.marketplaceListing.findFirst({
      where: { id: listingId, sellerId: userId },
      select: { id: true, kind: true, defId: true, amount: true, status: true, currency: true },
    });
    if (!row) throw new GameError('not_found', 'No such listing.');
    if (row.currency !== 'credits') {
      throw new GameError('forbidden', 'Cancel on-chain listings from your wallet.');
    }

    const closed = await tx.marketplaceListing.updateMany({
      where: { id: row.id, status: 'open' },
      data: { status: 'cancelled' },
    });
    if (closed.count !== 1) throw new GameError('conflict', 'That listing is no longer open.');

    await addItems(tx, userId, [
      {
        kind: row.kind as 'resource' | 'module' | 'equipment' | 'cosmetic',
        defId: row.defId,
        amount: row.amount,
      },
    ]);
  });
}

export interface PurchaseResult {
  readonly listingId: string;
  readonly paid: number;
  readonly fee: number;
  readonly sellerProceeds: number;
}

/**
 * Buys an off-chain listing.
 *
 * The listing is closed by a conditional update before any credits move, so
 * two buyers racing on the last copy produce one sale and one clean failure.
 */
export async function buyCreditListing(
  db: Db,
  userId: string,
  listingId: string,
): Promise<PurchaseResult> {
  return db.$transaction(async (tx) => {
    const row = await tx.marketplaceListing.findUnique({
      where: { id: listingId },
      select: {
        id: true,
        sellerId: true,
        kind: true,
        defId: true,
        amount: true,
        price: true,
        currency: true,
        status: true,
      },
    });
    if (!row) throw new GameError('not_found', 'No such listing.');
    if (row.currency !== 'credits') {
      throw new GameError('forbidden', 'That listing settles on chain, not in credits.');
    }
    if (row.sellerId === userId) throw new GameError('forbidden', 'You cannot buy your own listing.');

    const claimed = await tx.marketplaceListing.updateMany({
      where: { id: row.id, status: 'open' },
      data: { status: 'sold', buyerId: userId, soldAt: new Date() },
    });
    if (claimed.count !== 1) throw new GameError('conflict', 'That listing is no longer available.');

    const sellerStanding = await readStanding(tx, row.sellerId);
    const fee = computeFee(Number(row.price), feeDiscountFor(sellerStanding));

    await moveCredits(tx, {
      userId,
      kind: 'market',
      delta: -BigInt(fee.gross),
      reason: `Bought ${row.amount} x ${row.defId}`,
      refId: row.id,
    });
    await moveCredits(tx, {
      userId: row.sellerId,
      kind: 'market',
      delta: BigInt(fee.net),
      reason: `Sold ${row.amount} x ${row.defId}`,
      refId: row.id,
    });

    await addItems(tx, userId, [
      {
        kind: row.kind as 'resource' | 'module' | 'equipment' | 'cosmetic',
        defId: row.defId,
        amount: row.amount,
      },
    ]);

    await recordEvent(tx, row.sellerId, events.sold(1));
    await tx.user.update({ where: { id: userId }, data: { tradesDone: { increment: 1 } } });

    return {
      listingId: row.id,
      paid: fee.gross,
      fee: fee.fee,
      sellerProceeds: fee.net,
    };
  });
}

/* ------------------------------------------------------------ the broker */

export interface BrokerResult {
  readonly credits: number;
  readonly amount: number;
  readonly resource: ResourceId;
}

/** Instant sale of raw ore to the station, at the station's spread. */
export async function brokerSell(
  db: Db,
  userId: string,
  resource: ResourceId,
  amount: number,
): Promise<BrokerResult> {
  if (!(resource in RESOURCES)) throw new GameError('not_found', 'No such resource.');
  return db.$transaction(async (tx) => {
    await removeItems(tx, userId, [{ kind: 'resource', defId: resource, amount }]);
    const credits = stationBuyPrice(resource, amount);
    await moveCredits(tx, {
      userId,
      kind: 'broker',
      delta: BigInt(credits),
      reason: `Sold ${amount} ${RESOURCES[resource].name} to the broker`,
    });
    await recordEvent(tx, userId, events.delivered(resource, amount));
    return { credits, amount, resource };
  });
}

/** Instant purchase of raw ore from the station. */
export async function brokerBuy(
  db: Db,
  userId: string,
  resource: ResourceId,
  amount: number,
): Promise<BrokerResult> {
  if (!(resource in RESOURCES)) throw new GameError('not_found', 'No such resource.');
  return db.$transaction(async (tx) => {
    const cost = stationSellPrice(resource, amount);
    await moveCredits(tx, {
      userId,
      kind: 'broker',
      delta: -BigInt(cost),
      reason: `Bought ${amount} ${RESOURCES[resource].name} from the broker`,
    });
    await addItems(tx, userId, [{ kind: 'resource', defId: resource, amount }]);
    return { credits: -cost, amount, resource };
  });
}

export { stationBuyPrice, stationSellPrice };
