'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Badge, RARITY_TEXT, Tabs } from '@nova/ui';
import type { ListingDto } from '@nova/shared';
import { api } from '@/lib/api';
import { formatCredits, formatEth, relativeTime, shortAddress } from '@/lib/format';

/**
 * The public marketplace.
 *
 * Browsable without signing in — a listing is public information, and a
 * prospective player should be able to see what the economy looks like before
 * committing a wallet to it. Buying requires the game client.
 */
export default function MarketplacePage() {
  const [sort, setSort] = useState('newest');
  const [listings, setListings] = useState<ListingDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .get<{ listings: ListingDto[] }>(`/api/marketplace?sort=${sort}&limit=50`)
      .then((data) => {
        if (!cancelled) setListings(data.listings);
      })
      .catch(() => {
        if (!cancelled) setError('The exchange is not reachable right now.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [sort]);

  return (
    <main className="min-h-screen bg-[#05070d] text-slate-200">
      <div className="mx-auto max-w-5xl px-5 py-10">
        <Link href="/" className="text-[11px] uppercase tracking-[0.2em] text-slate-500 hover:text-sky-300">
          ← Nova Station
        </Link>

        <header className="mt-6">
          <p className="text-[10px] uppercase tracking-[0.42em] text-amber-500">Nova Exchange</p>
          <h1 className="mt-1 text-3xl tracking-tight text-slate-50">Open listings</h1>
          <p className="mt-2 max-w-xl text-[13px] text-slate-500">
            Credit listings settle instantly on the station ledger. ETH listings are escrowed in the
            marketplace contract and settle on Sepolia. Sign in to trade.
          </p>
        </header>

        <Tabs
          items={[
            { id: 'newest', label: 'Newest' },
            { id: 'price_asc', label: 'Price ↑' },
            { id: 'price_desc', label: 'Price ↓' },
            { id: 'rarity', label: 'Rarity' },
          ]}
          active={sort}
          onChange={setSort}
          className="mt-8"
        />

        {loading && <p className="py-12 text-center text-xs text-slate-500">Reading the order book…</p>}
        {error && <p className="py-12 text-center text-xs text-rose-400">{error}</p>}

        {!loading && !error && listings.length === 0 && (
          <p className="py-12 text-center text-xs text-slate-500">
            Nothing is listed at the moment. The exchange fills up as players do.
          </p>
        )}

        <ul className="mt-4 divide-y divide-slate-800/70">
          {listings.map((listing) => (
            <li key={listing.id} className="flex items-center gap-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className={`text-sm ${RARITY_TEXT[listing.rarity]}`}>{listing.name}</span>
                  {listing.amount > 1 && (
                    <span className="text-[11px] text-slate-500">×{listing.amount}</span>
                  )}
                  {listing.onChain && <Badge color="#c084fc">⛓ on-chain</Badge>}
                </div>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  {listing.sellerName} · {shortAddress(listing.seller)} ·{' '}
                  {relativeTime(listing.createdAt)}
                </p>
              </div>
              <span className="font-mono text-sm text-amber-300">
                {listing.currency === 'eth'
                  ? `${formatEth(listing.price)} ETH`
                  : `${formatCredits(Number(listing.price))}c`}
              </span>
            </li>
          ))}
        </ul>

        <div className="mt-10 border-t border-slate-800 pt-6 text-center">
          <Link
            href="/play"
            className="inline-block border border-sky-400/70 bg-sky-500/15 px-8 py-3 text-sm uppercase tracking-[0.2em] text-sky-100 transition-colors hover:bg-sky-500/25"
          >
            Enter station to trade
          </Link>
        </div>
      </div>
    </main>
  );
}
