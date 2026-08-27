'use client';

import { useEffect, useState } from 'react';
import { MINING_ZONES_BY_ID } from '@nova/game-data';
import { usePlayerStore } from '@/stores/usePlayerStore';
import { useGameStore } from '@/stores/useGameStore';
import { formatDuration } from '@/lib/format';

/**
 * The transit leg.
 *
 * Travel time is real — the server refuses extraction until the ship arrives —
 * so this screen shows the actual countdown rather than a decorative one, and
 * flips to the field the moment it expires.
 */
export function TravelScreen() {
  const expedition = usePlayerStore((state) => state.expedition);
  const refreshExpedition = usePlayerStore((state) => state.refreshExpedition);
  const setPhase = useGameStore((state) => state.setPhase);
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    if (!expedition) return undefined;
    const update = () => {
      const seconds = Math.max(
        0,
        Math.ceil((new Date(expedition.arrivesAt).getTime() - Date.now()) / 1000),
      );
      setRemaining(seconds);
      if (seconds <= 0) {
        void refreshExpedition().then(() => setPhase('field'));
      }
    };
    update();
    const timer = window.setInterval(update, 500);
    return () => window.clearInterval(timer);
  }, [expedition, refreshExpedition, setPhase]);

  if (!expedition) return null;
  const zone = MINING_ZONES_BY_ID.get(expedition.zoneId);
  const total = Math.max(
    1,
    (new Date(expedition.arrivesAt).getTime() - new Date(expedition.startedAt).getTime()) / 1000,
  );
  const progress = 1 - remaining / total;

  return (
    <div className="scanlines fixed inset-0 z-30 flex items-center justify-center bg-[#05070d]">
      <div aria-hidden className="grid-backdrop pointer-events-none absolute inset-0 opacity-25" />
      <div className="relative z-10 w-full max-w-md px-6 text-center">
        <p className="text-[10px] uppercase tracking-[0.42em] text-sky-500">In transit</p>
        <h1 className="mt-2 text-3xl tracking-tight text-slate-100">{zone?.name}</h1>
        <p className="mt-2 text-[13px] text-slate-500">{zone?.description}</p>

        <div className="mt-10">
          <div className="relative h-1 w-full bg-slate-900">
            <div
              className="h-full bg-sky-400 transition-[width] duration-500"
              style={{ width: `${Math.min(100, progress * 100)}%`, boxShadow: '0 0 12px #38bdf8' }}
            />
            <span
              aria-hidden
              className="absolute top-1/2 -translate-y-1/2 text-sky-300 transition-[left] duration-500"
              style={{ left: `calc(${Math.min(100, progress * 100)}% - 8px)` }}
            >
              ▸
            </span>
          </div>
          <p className="mt-3 font-mono text-sm text-slate-300">{formatDuration(remaining)}</p>
          <p className="mt-1 text-[11px] text-slate-600">
            {zone?.distanceAu} AU · hazard {Math.round((zone?.hazard ?? 0) * 100)}%
          </p>
        </div>
      </div>
    </div>
  );
}
