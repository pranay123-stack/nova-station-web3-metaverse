'use client';

import { MINING_ZONES, type MiningZoneDef } from '@nova/game-data';
import { Badge, Button, Meter } from '@nova/ui';
import { api } from '@/lib/api';
import { usePlayerStore } from '@/stores/usePlayerStore';
import { useGameStore } from '@/stores/useGameStore';
import { formatDuration, stars } from '@/lib/format';
import { playLaunch } from '@/game/audio/engine';
import { useAction, usePanelData } from './usePanelData';

interface ZoneRow extends MiningZoneDef {
  readonly cost: { fuel: number; travelSec: number } | null;
}

/** Launch control: pick a field, check the fuel, go. */
export function LaunchPanel() {
  const ships = usePlayerStore((state) => state.ships);
  const player = usePlayerStore((state) => state.player);
  const refreshExpedition = usePlayerStore((state) => state.refreshExpedition);
  const refreshShips = usePlayerStore((state) => state.refreshShips);
  const setPhase = useGameStore((state) => state.setPhase);
  const closePanel = useGameStore((state) => state.closePanel);
  const { run, busy } = useAction();

  const ship = ships.find((entry) => entry.active) ?? null;
  const { data } = usePanelData(() => api.get<{ zones: ZoneRow[] }>('/api/mining/zones'), []);

  const launch = (zoneId: string) => {
    if (!ship) return;
    void run(
      async () => {
        await api.post('/api/mining/launch', { zoneId, shipId: ship.id });
        playLaunch();
        await Promise.all([refreshExpedition(), refreshShips()]);
        closePanel();
        setPhase('travelling');
      },
      { success: 'Launch authorised' },
    );
  };

  if (!ship) {
    return (
      <p className="py-8 text-center text-xs text-slate-500">
        No active hull. Select one at Hangar Control before launching.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4 border border-slate-800/70 bg-slate-900/40 p-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs text-slate-200">{ship.name}</p>
          <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">{ship.shipClass}</p>
        </div>
        <div className="w-32">
          <Meter value={ship.fuel} max={ship.stats.fuel} label="Fuel" color="#22d3ee" height="thin" showValue />
        </div>
        <div className="w-32">
          <Meter value={0} max={ship.stats.cargo} label="Hold" color="#f97316" height="thin" showValue />
        </div>
      </div>

      <ul className="space-y-2">
        {(data?.zones ?? MINING_ZONES.map((zone) => ({ ...zone, cost: null }))).map((zone) => {
          const locked = (player?.level ?? 1) < zone.requiredLevel;
          const fuelShort = zone.cost ? ship.fuel < zone.cost.fuel : false;

          return (
            <li
              key={zone.id}
              className={`border p-3 ${locked ? 'border-slate-800/60 opacity-60' : 'border-slate-700/60'} bg-slate-900/40`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="text-sm text-slate-100">{zone.name}</span>
                    <Badge color={zone.palette.star}>{zone.distanceAu} AU</Badge>
                    <span
                      className="font-mono text-[11px]"
                      style={{ color: zone.hazard > 0.3 ? '#f43f5e' : '#fbbf24' }}
                      title={`Hazard rating ${Math.round(zone.hazard * 100)}%`}
                    >
                      {stars(Math.ceil(zone.hazard * 5))}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-slate-400">{zone.description}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {zone.table.map((row) => (
                      <span
                        key={row.resource}
                        className="border border-slate-700/70 px-1.5 py-0.5 text-[10px] text-slate-400"
                      >
                        {row.resource.replace('_', ' ')}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="flex shrink-0 flex-col items-end gap-1.5 text-right">
                  {zone.cost && (
                    <p className="text-[10px] text-slate-500">
                      {zone.cost.fuel} fuel · {formatDuration(zone.cost.travelSec)} out
                    </p>
                  )}
                  <Button
                    size="sm"
                    variant="primary"
                    disabled={locked || fuelShort || busy}
                    loading={busy}
                    onClick={() => launch(zone.id)}
                  >
                    {locked ? `Lv ${zone.requiredLevel}` : fuelShort ? 'Low fuel' : 'Launch'}
                  </Button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
