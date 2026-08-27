'use client';

import { useState } from 'react';
import { REFINERY, RESOURCES, type ResourceId } from '@nova/game-data';
import { Button } from '@nova/ui';
import { api } from '@/lib/api';
import { usePlayerStore } from '@/stores/usePlayerStore';
import { formatCredits, formatDuration } from '@/lib/format';
import { useAction } from './usePanelData';

/**
 * The refinery: raw ore in, credits out.
 *
 * The quoted figure is computed from the same constants the server uses, so the
 * number shown before pressing the button is the number that arrives after.
 */
export function RefineryPanel() {
  const inventory = usePlayerStore((state) => state.inventory);
  const refreshInventory = usePlayerStore((state) => state.refreshInventory);
  const refreshPlayer = usePlayerStore((state) => state.refreshPlayer);
  const { run, busy } = useAction();

  const ores = (inventory?.entries ?? []).filter((entry) => entry.kind === 'resource');
  const [batch, setBatch] = useState<Record<string, number>>({});

  const entries = Object.entries(batch).filter(([, amount]) => amount > 0);
  const grossValue = entries.reduce(
    (sum, [resource, amount]) => sum + RESOURCES[resource as ResourceId].baseValue * amount,
    0,
  );
  const estimate = Math.floor(grossValue * REFINERY.baseYield);
  const units = entries.reduce((sum, [, amount]) => sum + amount, 0);

  return (
    <div className="space-y-4">
      <p className="text-[11px] leading-relaxed text-slate-400">
        The assay line pays {Math.round(REFINERY.baseYield * 100)}% of catalogue value and keeps the
        rest. It is the fastest way to turn a hold full of rock into credits — the exchange pays more,
        but only when somebody is buying.
      </p>

      <ul className="space-y-1.5">
        {ores.length === 0 && (
          <li className="py-6 text-center text-xs text-slate-500">No ore in the hold.</li>
        )}
        {ores.map((entry) => {
          const resource = RESOURCES[entry.defId as ResourceId];
          const selected = batch[entry.defId] ?? 0;
          return (
            <li
              key={entry.defId}
              className="flex items-center gap-3 border border-slate-800/70 bg-slate-900/40 p-2"
            >
              <span className="h-3 w-3 shrink-0" style={{ background: resource.color }} />
              <div className="min-w-0 flex-1">
                <p className="text-xs text-slate-200">{resource.name}</p>
                <p className="text-[10px] text-slate-500">
                  {entry.amount} held · {formatCredits(resource.baseValue)}c catalogue
                </p>
              </div>
              <input
                type="range"
                min={0}
                max={entry.amount}
                value={selected}
                aria-label={`Refine ${resource.name}`}
                onChange={(event) =>
                  setBatch((current) => ({ ...current, [entry.defId]: Number(event.target.value) }))
                }
                className="w-28 accent-sky-400"
              />
              <span className="w-12 text-right font-mono text-[11px] text-slate-300">{selected}</span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  setBatch((current) => ({
                    ...current,
                    [entry.defId]: current[entry.defId] === entry.amount ? 0 : entry.amount,
                  }))
                }
              >
                All
              </Button>
            </li>
          );
        })}
      </ul>

      <div className="flex items-center justify-between border-t border-slate-800 pt-3">
        <div className="text-[11px] text-slate-400">
          <p>
            {units} units · <span className="text-amber-300">{formatCredits(estimate)}c</span>
          </p>
          <p className="text-slate-600">
            Processing time {formatDuration(Math.ceil(units * REFINERY.secPerUnit))}
          </p>
        </div>
        <Button
          variant="primary"
          disabled={units === 0 || busy || entries.length > 6}
          loading={busy}
          onClick={() =>
            void run(
              async () => {
                await api.post('/api/mining/refine', {
                  batch: entries.map(([resource, amount]) => ({ resource, amount })),
                });
                setBatch({});
                await Promise.all([refreshInventory(), refreshPlayer()]);
              },
              { success: 'Batch processed' },
            )
          }
        >
          {entries.length > 6 ? 'Max 6 types' : 'Process batch'}
        </Button>
      </div>
    </div>
  );
}
