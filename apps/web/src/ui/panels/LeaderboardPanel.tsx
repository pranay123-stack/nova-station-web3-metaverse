'use client';

import { useState } from 'react';
import { FACTIONS } from '@nova/game-data';
import { Tabs } from '@nova/ui';
import type { LeaderboardRowDto } from '@nova/shared';
import { api } from '@/lib/api';
import { formatCredits, shortAddress } from '@/lib/format';
import { usePanelData } from './usePanelData';

const METRICS = [
  { id: 'level', label: 'Level' },
  { id: 'credits', label: 'Credits' },
  { id: 'missions', label: 'Contracts' },
  { id: 'mined', label: 'Ore mined' },
  { id: 'reputation', label: 'Standing' },
] as const;

export function LeaderboardPanel() {
  const [metric, setMetric] = useState<string>('level');
  const { data, loading } = usePanelData(
    () => api.get<{ rows: LeaderboardRowDto[] }>(`/api/leaderboard?metric=${metric}&limit=25`),
    [metric],
  );

  return (
    <div>
      <Tabs items={METRICS.map((m) => ({ id: m.id, label: m.label }))} active={metric} onChange={setMetric} className="mb-3" />

      {loading && <p className="py-6 text-center text-xs text-slate-500">Reading the registry…</p>}

      <ol className="space-y-1">
        {(data?.rows ?? []).map((row) => {
          const faction = row.faction ? FACTIONS[row.faction] : null;
          return (
            <li
              key={row.address}
              className="flex items-center gap-3 border border-slate-800/70 bg-slate-900/40 px-3 py-1.5"
            >
              <span
                className={`w-6 text-right font-mono text-xs ${
                  row.rank <= 3 ? 'text-amber-300' : 'text-slate-500'
                }`}
              >
                {row.rank}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs text-slate-200">{row.displayName}</p>
                <p className="font-mono text-[10px] text-slate-500">{shortAddress(row.address)}</p>
              </div>
              {faction && (
                <span className="text-[10px]" style={{ color: faction.color }}>
                  {faction.name}
                </span>
              )}
              <span className="w-24 text-right font-mono text-xs text-sky-300">
                {metric === 'credits' || metric === 'mined'
                  ? formatCredits(row.value)
                  : row.value.toLocaleString()}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
