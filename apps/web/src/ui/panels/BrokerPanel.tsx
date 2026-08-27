'use client';

import { useState } from 'react';
import { RESOURCES, type ResourceId } from '@nova/game-data';
import { Button, Tabs } from '@nova/ui';
import { api } from '@/lib/api';
import { usePlayerStore } from '@/stores/usePlayerStore';
import { formatCredits } from '@/lib/format';
import { useAction, usePanelData } from './usePanelData';

interface BrokerPrice {
  readonly resource: ResourceId;
  readonly name: string;
  readonly buy: number;
  readonly sell: number;
}

/** Instant liquidity at the station's spread — the floor under every price. */
export function BrokerPanel() {
  const [tab, setTab] = useState('sell');
  const [amounts, setAmounts] = useState<Record<string, number>>({});
  const inventory = usePlayerStore((state) => state.inventory);
  const refreshInventory = usePlayerStore((state) => state.refreshInventory);
  const refreshPlayer = usePlayerStore((state) => state.refreshPlayer);
  const { run, busy } = useAction();

  const { data } = usePanelData(
    () => api.get<{ prices: BrokerPrice[] }>('/api/marketplace/broker'),
    [],
  );

  const held = new Map(
    (inventory?.entries ?? [])
      .filter((entry) => entry.kind === 'resource')
      .map((entry) => [entry.defId, entry.amount]),
  );

  const trade = (resource: ResourceId, amount: number, side: 'sell' | 'buy') =>
    void run(
      async () => {
        await api.post(`/api/marketplace/broker/${side}`, { resource, amount });
        setAmounts((current) => ({ ...current, [resource]: 0 }));
        await Promise.all([refreshInventory(), refreshPlayer()]);
      },
      { success: side === 'sell' ? 'Ore sold' : 'Ore purchased' },
    );

  return (
    <div>
      <Tabs
        items={[
          { id: 'sell', label: 'Sell to station' },
          { id: 'buy', label: 'Buy from station' },
        ]}
        active={tab}
        onChange={setTab}
        className="mb-3"
      />

      <ul className="space-y-1.5">
        {(data?.prices ?? []).map((price) => {
          const resource = RESOURCES[price.resource];
          const owned = held.get(price.resource) ?? 0;
          const amount = amounts[price.resource] ?? 0;
          const max = tab === 'sell' ? owned : 999;
          const unit = tab === 'sell' ? price.sell : price.buy;

          return (
            <li
              key={price.resource}
              className="flex items-center gap-3 border border-slate-800/70 bg-slate-900/40 p-2"
            >
              <span className="h-3 w-3 shrink-0" style={{ background: resource.color }} />
              <div className="min-w-0 flex-1">
                <p className="text-xs text-slate-200">{resource.name}</p>
                <p className="text-[10px] text-slate-500">
                  {tab === 'sell' ? `${owned} held` : `${formatCredits(price.buy)}c each`} ·{' '}
                  <span className={tab === 'sell' ? 'text-emerald-400' : 'text-rose-400'}>
                    {formatCredits(unit)}c
                  </span>
                </p>
              </div>
              <input
                type="number"
                min={0}
                max={max}
                value={amount}
                aria-label={`${tab} ${resource.name} amount`}
                onChange={(event) =>
                  setAmounts((current) => ({
                    ...current,
                    [price.resource]: Math.max(0, Math.min(max, Number(event.target.value))),
                  }))
                }
                className="w-20 border border-slate-700/60 bg-slate-900/60 px-2 py-1 text-right font-mono text-xs text-slate-200 outline-none focus:border-sky-500/60"
              />
              <span className="w-20 text-right font-mono text-[11px] text-amber-300">
                {formatCredits(unit * amount)}c
              </span>
              <Button
                size="sm"
                variant={tab === 'sell' ? 'success' : 'secondary'}
                disabled={amount <= 0 || busy}
                loading={busy}
                onClick={() => trade(price.resource, amount, tab as 'sell' | 'buy')}
              >
                {tab === 'sell' ? 'Sell' : 'Buy'}
              </Button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
