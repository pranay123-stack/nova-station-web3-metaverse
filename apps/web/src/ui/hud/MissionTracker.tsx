'use client';

import { MISSIONS_BY_ID } from '@nova/game-data';
import { usePlayerStore } from '@/stores/usePlayerStore';
import { useGameStore } from '@/stores/useGameStore';
import { formatDuration } from '@/lib/format';

/** The two or three contracts a player is actually running, always visible. */
export function MissionTracker() {
  const missions = usePlayerStore((state) => state.missions);
  const openPanel = useGameStore((state) => state.openPanel);

  if (missions.length === 0) return null;

  return (
    <aside className="absolute left-3 top-24 w-64 sm:left-4" aria-label="Active contracts">
      <button
        type="button"
        onClick={() => openPanel('missions')}
        className="pointer-events-auto w-full border border-slate-700/60 bg-slate-950/80 text-left backdrop-blur-md transition-colors hover:border-sky-500/60 focus-visible:ring-1 focus-visible:ring-sky-400 focus-visible:outline-none"
      >
        <header className="border-b border-slate-800/80 px-3 py-1.5">
          <h2 className="text-[10px] uppercase tracking-[0.24em] text-slate-400">Active Contracts</h2>
        </header>
        <ul className="divide-y divide-slate-800/60">
          {missions.slice(0, 3).map((entry) => {
            const mission = MISSIONS_BY_ID.get(entry.missionId);
            if (!mission) return null;
            const done = entry.progress.reduce((sum, value) => sum + value, 0);
            const target = entry.targets.reduce((sum, value) => sum + value, 0);
            const fraction = target > 0 ? Math.min(1, done / target) : 0;

            return (
              <li key={entry.id} className="px-3 py-2">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-[11px] text-slate-200">{mission.title}</span>
                  <span
                    className={`font-mono text-[10px] ${
                      entry.complete ? 'text-emerald-300' : 'text-slate-500'
                    }`}
                  >
                    {entry.complete ? 'READY' : formatDuration(entry.secondsRemaining)}
                  </span>
                </div>
                <div className="mt-1 h-0.5 w-full bg-slate-800">
                  <div
                    className={`h-full transition-[width] duration-500 ${
                      entry.complete ? 'bg-emerald-400' : 'bg-sky-400'
                    }`}
                    style={{ width: `${fraction * 100}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      </button>
    </aside>
  );
}
