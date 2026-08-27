'use client';

import { useEffect, useState } from 'react';
import { useAccount } from 'wagmi';
import { NovaMarketplaceAbi } from '@nova/web3';
import { Badge, Button, RARITY_TEXT, Tabs } from '@nova/ui';
import type { ListingDto } from '@nova/shared';
import { api } from '@/lib/api';
import { usePlayerStore } from '@/stores/usePlayerStore';
import { useChainConfig, useContractWrite } from '@/lib/useChain';
import { formatCredits, formatEth, relativeTime, shortAddress } from '@/lib/format';
import { useAction, usePanelData } from './usePanelData';
import { TxStatus } from './TxStatus';

const SORTS = [
  { id: 'newest', label: 'Newest' },
  { id: 'price_asc', label: 'Price ↑' },
  { id: 'price_desc', label: 'Price ↓' },
  { id: 'rarity', label: 'Rarity' },
] as const;

const CATEGORIES = ['all', 'module', 'equipment', 'cosmetic', 'resource', 'ship'] as const;

/**
 * The exchange.
 *
 * Two markets share one interface, and the difference is never hidden: credit
 * listings settle instantly on the game server, ETH listings settle on chain
 * through the player's own wallet. Each row says which it is.
 */
export function MarketPanel() {
  const [tab, setTab] = useState('browse');
  const [sort, setSort] = useState<string>('newest');
  const [category, setCategory] = useState<string>('all');
  const [onChainOnly, setOnChainOnly] = useState(false);

  const player = usePlayerStore((state) => state.player);
  const inventory = usePlayerStore((state) => state.inventory);
  const refreshInventory = usePlayerStore((state) => state.refreshInventory);
  const refreshPlayer = usePlayerStore((state) => state.refreshPlayer);
  const { run, busy } = useAction();
  const { config, load } = useChainConfig();
  const { write, state: tx, reset } = useContractWrite();
  const { isConnected } = useAccount();

  useEffect(() => {
    void load();
  }, [load]);

  const query = `/api/marketplace?sort=${sort}${category !== 'all' ? `&category=${category}` : ''}${
    onChainOnly ? '&onChainOnly=true' : ''
  }`;

  const { data, refresh } = usePanelData(
    () => api.get<{ listings: ListingDto[] }>(query),
    [sort, category, onChainOnly],
  );
  const mine = usePanelData(() => api.get<{ listings: ListingDto[] }>('/api/marketplace/mine'), []);

  const buyCredits = (listing: ListingDto) =>
    void run(
      async () => {
        await api.post('/api/marketplace/buy', { listingId: listing.id });
        await Promise.all([refresh(), refreshInventory(), refreshPlayer()]);
      },
      { success: `${listing.name} purchased` },
    );

  const buyOnChain = async (listing: ListingDto) => {
    if (!listing.chain || !config) return;
    reset();
    const hash = await write({
      address: config.contracts.marketplace,
      abi: NovaMarketplaceAbi as never,
      functionName: 'buy',
      args: [BigInt(listing.chain.listingId)],
      value: BigInt(listing.price),
      intent: 'buy',
      description: `Purchase of ${listing.name}`,
    });
    if (hash) await refresh();
  };

  return (
    <div>
      <Tabs
        items={[
          { id: 'browse', label: 'Browse', badge: data?.listings.length ?? 0 },
          { id: 'sell', label: 'Sell' },
          { id: 'mine', label: 'My listings', badge: mine.data?.listings.length ?? 0 },
        ]}
        active={tab}
        onChange={setTab}
        className="mb-3"
      />

      <TxStatus phase={tx.phase} hash={tx.hash} error={tx.error} />

      {tab === 'browse' && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              aria-label="Filter by category"
              className="border border-slate-700/60 bg-slate-900/60 px-2 py-1.5 text-xs text-slate-300 outline-none focus:border-sky-500/60"
            >
              {CATEGORIES.map((entry) => (
                <option key={entry} value={entry}>
                  {entry === 'all' ? 'All categories' : entry}
                </option>
              ))}
            </select>
            <select
              value={sort}
              onChange={(event) => setSort(event.target.value)}
              aria-label="Sort listings"
              className="border border-slate-700/60 bg-slate-900/60 px-2 py-1.5 text-xs text-slate-300 outline-none focus:border-sky-500/60"
            >
              {SORTS.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.label}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-1.5 text-[11px] text-slate-400">
              <input
                type="checkbox"
                checked={onChainOnly}
                onChange={(event) => setOnChainOnly(event.target.checked)}
                className="h-3.5 w-3.5 accent-violet-500"
              />
              On-chain only
            </label>
            <span className="ml-auto text-[11px] text-slate-500">
              Balance {formatCredits(player?.credits ?? 0)}c
            </span>
          </div>

          <ul className="space-y-1.5">
            {(data?.listings ?? []).length === 0 && (
              <li className="py-8 text-center text-xs text-slate-500">Nothing listed right now.</li>
            )}
            {(data?.listings ?? []).map((listing) => {
              const isMine = listing.seller === player?.address;
              return (
                <li
                  key={listing.id}
                  className={`flex items-center gap-3 border p-2 ${
                    listing.onChain ? 'border-violet-500/30' : 'border-slate-800/70'
                  } bg-slate-900/40`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <span className={`text-xs ${RARITY_TEXT[listing.rarity]}`}>{listing.name}</span>
                      {listing.amount > 1 && <span className="text-[10px] text-slate-500">×{listing.amount}</span>}
                      {listing.onChain && <Badge color="#c084fc">⛓ on-chain</Badge>}
                    </div>
                    <p className="mt-0.5 text-[10px] text-slate-500">
                      {listing.sellerName} · {shortAddress(listing.seller)} ·{' '}
                      {relativeTime(listing.createdAt)}
                    </p>
                  </div>
                  <span className="font-mono text-xs text-amber-300">
                    {listing.currency === 'eth'
                      ? `${formatEth(listing.price)} ETH`
                      : `${formatCredits(Number(listing.price))}c`}
                  </span>
                  <Button
                    size="sm"
                    variant="primary"
                    disabled={isMine || busy || (listing.onChain && !isConnected)}
                    loading={busy}
                    onClick={() =>
                      listing.onChain ? void buyOnChain(listing) : buyCredits(listing)
                    }
                  >
                    {isMine ? 'Yours' : listing.onChain && !isConnected ? 'Connect' : 'Buy'}
                  </Button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {tab === 'sell' && (
        <SellTab
          entries={inventory?.entries ?? []}
          busy={busy}
          onListed={async () => {
            await Promise.all([refresh(), mine.refresh(), refreshInventory(), refreshPlayer()]);
          }}
          run={run}
        />
      )}

      {tab === 'mine' && (
        <ul className="space-y-1.5">
          {(mine.data?.listings ?? []).length === 0 && (
            <li className="py-8 text-center text-xs text-slate-500">You have nothing listed.</li>
          )}
          {(mine.data?.listings ?? []).map((listing) => (
            <li
              key={listing.id}
              className="flex items-center gap-3 border border-slate-800/70 bg-slate-900/40 p-2"
            >
              <div className="min-w-0 flex-1">
                <span className={`text-xs ${RARITY_TEXT[listing.rarity]}`}>{listing.name}</span>
                <p className="text-[10px] text-slate-500">
                  ×{listing.amount} · listed {relativeTime(listing.createdAt)}
                </p>
              </div>
              <span className="font-mono text-xs text-amber-300">
                {listing.currency === 'eth'
                  ? `${formatEth(listing.price)} ETH`
                  : `${formatCredits(Number(listing.price))}c`}
              </span>
              <Button
                size="sm"
                variant="ghost"
                loading={busy}
                disabled={listing.onChain}
                title={listing.onChain ? 'Cancel on-chain listings from your wallet' : undefined}
                onClick={() =>
                  void run(
                    async () => {
                      await api.post('/api/marketplace/cancel', { listingId: listing.id });
                      await Promise.all([mine.refresh(), refresh(), refreshInventory()]);
                    },
                    { success: 'Listing withdrawn' },
                  )
                }
              >
                Cancel
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SellTab({
  entries,
  busy,
  onListed,
  run,
}: {
  entries: readonly { kind: string; defId: string; name: string; amount: number; rarity: string; value: number }[];
  busy: boolean;
  onListed: () => Promise<void>;
  run: ReturnType<typeof useAction>['run'];
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [amount, setAmount] = useState(1);
  const [price, setPrice] = useState(100);

  const entry = entries.find((item) => `${item.kind}:${item.defId}` === selected);

  return (
    <div className="space-y-3">
      <ul className="max-h-56 space-y-1 overflow-y-auto">
        {entries.map((item) => {
          const key = `${item.kind}:${item.defId}`;
          return (
            <li key={key}>
              <button
                type="button"
                onClick={() => {
                  setSelected(key);
                  setAmount(1);
                  setPrice(Math.max(1, item.value || 100));
                }}
                className={`flex w-full items-center justify-between gap-3 border px-2 py-1.5 text-left transition-colors ${
                  selected === key
                    ? 'border-sky-500/60 bg-sky-500/10'
                    : 'border-slate-800/70 bg-slate-900/40 hover:border-slate-600'
                }`}
              >
                <span className={`truncate text-xs ${RARITY_TEXT[item.rarity]}`}>{item.name}</span>
                <span className="font-mono text-[10px] text-slate-500">×{item.amount}</span>
              </button>
            </li>
          );
        })}
      </ul>

      {entry && (
        <div className="space-y-2 border-t border-slate-800 pt-3">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label htmlFor="list-amount" className="text-[10px] uppercase tracking-[0.2em] text-slate-500">
                Quantity
              </label>
              <input
                id="list-amount"
                type="number"
                min={1}
                max={entry.amount}
                value={amount}
                onChange={(event) =>
                  setAmount(Math.max(1, Math.min(entry.amount, Number(event.target.value))))
                }
                className="mt-1 w-24 border border-slate-700/60 bg-slate-900/60 px-2 py-1.5 text-right font-mono text-xs text-slate-200 outline-none focus:border-sky-500/60"
              />
            </div>
            <div>
              <label htmlFor="list-price" className="text-[10px] uppercase tracking-[0.2em] text-slate-500">
                Asking price (credits)
              </label>
              <input
                id="list-price"
                type="number"
                min={1}
                value={price}
                onChange={(event) => setPrice(Math.max(1, Number(event.target.value)))}
                className="mt-1 w-32 border border-slate-700/60 bg-slate-900/60 px-2 py-1.5 text-right font-mono text-xs text-slate-200 outline-none focus:border-sky-500/60"
              />
            </div>
            <Button
              variant="primary"
              loading={busy}
              onClick={() =>
                void run(
                  async () => {
                    await api.post('/api/marketplace/list', {
                      kind: entry.kind,
                      defId: entry.defId,
                      amount,
                      price,
                    });
                    setSelected(null);
                    await onListed();
                  },
                  { success: 'Listed on the exchange' },
                )
              }
            >
              List for sale
            </Button>
          </div>
          <p className="text-[11px] text-slate-500">
            Listing moves the item into escrow immediately and charges a small posting fee. Prices are
            bounded to a sane range around the item&apos;s catalogue value.
          </p>
        </div>
      )}
    </div>
  );
}
