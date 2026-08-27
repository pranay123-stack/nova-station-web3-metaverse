'use client';

import { useState } from 'react';
import {
  MODULES_BY_ID,
  SHIPS,
  SHIP_CLASS_LABEL,
  SHIP_STAT_LABEL,
  type ShipStats,
} from '@nova/game-data';
import { Badge, Button, Meter, RARITY_TEXT, Tabs } from '@nova/ui';
import type { ShipDto } from '@nova/shared';
import { api } from '@/lib/api';
import { usePlayerStore } from '@/stores/usePlayerStore';
import { formatCredits } from '@/lib/format';
import { useAction, usePanelData } from './usePanelData';

interface UpgradeQuote {
  readonly stat: keyof ShipStats;
  readonly tier: number;
  readonly canUpgrade: boolean;
  readonly cost: { credits: number; resources: { resource: string; amount: number }[] };
}

const STAT_KEYS: (keyof ShipStats)[] = [
  'speed',
  'cargo',
  'fuel',
  'miningPower',
  'defense',
  'sensors',
];

/** Ship management: select, rename, upgrade, fit modules and refuel. */
export function HangarPanel() {
  const ships = usePlayerStore((state) => state.ships);
  const inventory = usePlayerStore((state) => state.inventory);
  const refreshShips = usePlayerStore((state) => state.refreshShips);
  const refreshPlayer = usePlayerStore((state) => state.refreshPlayer);
  const refreshInventory = usePlayerStore((state) => state.refreshInventory);
  const { run, busy } = useAction();

  const [tab, setTab] = useState('fleet');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = ships.find((ship) => ship.id === selectedId) ?? ships.find((s) => s.active) ?? ships[0] ?? null;

  const reload = async () => {
    await Promise.all([refreshShips(), refreshPlayer(), refreshInventory()]);
  };

  return (
    <div>
      <Tabs
        items={[
          { id: 'fleet', label: 'Fleet', badge: ships.length },
          { id: 'shipyard', label: 'Shipyard' },
        ]}
        active={tab}
        onChange={setTab}
        className="mb-4"
      />

      {tab === 'fleet' && (
        <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
          <ul className="space-y-1.5">
            {ships.map((ship) => (
              <li key={ship.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(ship.id)}
                  className={`w-full border px-3 py-2 text-left transition-colors ${
                    selected?.id === ship.id
                      ? 'border-sky-500/60 bg-sky-500/10'
                      : 'border-slate-800/70 bg-slate-900/40 hover:border-slate-600'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className={`truncate text-xs ${RARITY_TEXT[ship.rarity]}`}>{ship.name}</span>
                    {ship.active && <Badge color="#4ade80">Active</Badge>}
                  </div>
                  <p className="mt-0.5 text-[10px] uppercase tracking-[0.14em] text-slate-500">
                    {SHIP_CLASS_LABEL[ship.shipClass as keyof typeof SHIP_CLASS_LABEL] ?? ship.shipClass}
                    {ship.tokenId && ' · ⛓ on-chain'}
                  </p>
                </button>
              </li>
            ))}
          </ul>

          {selected ? (
            <ShipDetail
              ship={selected}
              busy={busy}
              onReload={reload}
              modulesOwned={
                inventory?.entries.filter((entry) => entry.kind === 'module') ?? []
              }
              run={run}
            />
          ) : (
            <p className="py-8 text-center text-xs text-slate-500">No hulls in the hangar.</p>
          )}
        </div>
      )}

      {tab === 'shipyard' && <Shipyard busy={busy} run={run} onReload={reload} />}
    </div>
  );
}

function ShipDetail({
  ship,
  busy,
  onReload,
  modulesOwned,
  run,
}: {
  ship: ShipDto;
  busy: boolean;
  onReload: () => Promise<void>;
  modulesOwned: readonly { defId: string; name: string; amount: number }[];
  run: ReturnType<typeof useAction>['run'];
}) {
  const [name, setName] = useState(ship.name);
  const { data: upgrades, refresh: refreshUpgrades } = usePanelData(
    () => api.get<{ upgrades: UpgradeQuote[] }>(`/api/ships/${ship.id}/upgrades`),
    [ship.id],
  );

  const act = async (fn: () => Promise<unknown>, success: string) => {
    await run(
      async () => {
        await fn();
        await onReload();
        await refreshUpgrades();
      },
      { success },
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex-1">
          <label htmlFor="ship-name" className="text-[10px] uppercase tracking-[0.2em] text-slate-500">
            Callsign
          </label>
          <input
            id="ship-name"
            value={name}
            maxLength={24}
            onChange={(event) => setName(event.target.value)}
            className="mt-1 w-full border border-slate-700/60 bg-slate-900/60 px-2 py-1.5 text-xs text-slate-200 outline-none focus:border-sky-500/60"
          />
        </div>
        <Button
          size="sm"
          loading={busy}
          disabled={name.trim() === ship.name}
          onClick={() => act(() => api.post('/api/ships/rename', { shipId: ship.id, name: name.trim() }), 'Callsign updated')}
        >
          Rename
        </Button>
        {!ship.active && (
          <Button
            size="sm"
            variant="primary"
            loading={busy}
            onClick={() => act(() => api.post('/api/ships/select', { shipId: ship.id }), `${ship.name} is now active`)}
          >
            Make active
          </Button>
        )}
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Systems</h3>
          <span className="font-mono text-[11px] text-slate-500">
            Laser tier {ship.laserTier}
          </span>
        </div>
        <div className="space-y-2">
          {STAT_KEYS.map((stat) => {
            const quote = upgrades?.upgrades.find((entry) => entry.stat === stat);
            const base = ship.baseStats[stat];
            const current = ship.stats[stat];
            return (
              <div key={stat} className="flex items-center gap-3">
                <div className="flex-1">
                  <Meter
                    value={current}
                    max={Math.max(current, base * 2.5)}
                    label={`${SHIP_STAT_LABEL[stat]}${quote && quote.tier > 0 ? ` · T${quote.tier}` : ''}`}
                    color={stat === 'miningPower' ? '#f97316' : '#38bdf8'}
                    height="thin"
                  />
                </div>
                <span className="w-14 text-right font-mono text-[11px] text-slate-300">
                  {Math.round(current)}
                </span>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={!quote?.canUpgrade || busy}
                  loading={busy}
                  onClick={() =>
                    act(
                      () => api.post('/api/ships/upgrade', { shipId: ship.id, stat }),
                      `${SHIP_STAT_LABEL[stat]} upgraded`,
                    )
                  }
                  title={
                    quote
                      ? `${formatCredits(quote.cost.credits)}c + ${quote.cost.resources
                          .map((resource) => `${resource.amount} ${resource.resource}`)
                          .join(', ')}`
                      : undefined
                  }
                >
                  {quote?.canUpgrade ? `${formatCredits(quote.cost.credits)}c` : 'Max'}
                </Button>
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <h3 className="mb-2 text-[10px] uppercase tracking-[0.2em] text-slate-500">
          Module slots ({ship.modules.filter(Boolean).length}/{ship.moduleSlots})
        </h3>
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
          {ship.modules.map((moduleId, index) => {
            const def = moduleId ? MODULES_BY_ID.get(moduleId) : null;
            return (
              <div
                key={index}
                className="flex items-center justify-between gap-2 border border-slate-800/70 bg-slate-900/40 px-2 py-1.5"
              >
                <span className={`truncate text-[11px] ${def ? RARITY_TEXT[def.rarity] : 'text-slate-600'}`}>
                  {def?.name ?? 'Empty slot'}
                </span>
                {def && (
                  <Button
                    size="sm"
                    variant="ghost"
                    loading={busy}
                    onClick={() =>
                      act(
                        () => api.post('/api/ships/unequip', { shipId: ship.id, slotIndex: index }),
                        `${def.name} removed`,
                      )
                    }
                  >
                    ✕
                  </Button>
                )}
              </div>
            );
          })}
        </div>

        {modulesOwned.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {modulesOwned.map((entry) => {
              const slot = ship.modules.findIndex((value) => value === null);
              return (
                <Button
                  key={entry.defId}
                  size="sm"
                  variant="secondary"
                  disabled={slot < 0 || busy}
                  loading={busy}
                  onClick={() =>
                    act(
                      () =>
                        api.post('/api/ships/equip', {
                          shipId: ship.id,
                          moduleId: entry.defId,
                          slotIndex: slot,
                        }),
                      `${entry.name} fitted`,
                    )
                  }
                >
                  Fit {entry.name} ×{entry.amount}
                </Button>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex items-center gap-3">
        <div className="flex-1">
          <Meter value={ship.fuel} max={ship.stats.fuel} label="Fuel" color="#22d3ee" showValue height="thin" />
        </div>
        <Button
          size="sm"
          loading={busy}
          disabled={ship.fuel >= ship.stats.fuel}
          onClick={() =>
            act(
              () =>
                api.post('/api/ships/refuel', {
                  shipId: ship.id,
                  amount: Math.max(1, Math.ceil(ship.stats.fuel - ship.fuel)),
                }),
              'Tanks topped up',
            )
          }
        >
          Refuel
        </Button>
      </div>
    </div>
  );
}

function Shipyard({
  busy,
  run,
  onReload,
}: {
  busy: boolean;
  run: ReturnType<typeof useAction>['run'];
  onReload: () => Promise<void>;
}) {
  return (
    <ul className="grid gap-2 sm:grid-cols-2">
      {SHIPS.map((def) => (
        <li key={def.id} className="border border-slate-800/70 bg-slate-900/40 p-3">
          <div className="flex items-baseline justify-between gap-2">
            <span className={`text-sm ${RARITY_TEXT[def.rarity]}`}>{def.name}</span>
            <Badge rarity={def.rarity}>{SHIP_CLASS_LABEL[def.shipClass]}</Badge>
          </div>
          <p className="mt-1 text-[11px] text-slate-400">{def.description}</p>
          <dl className="mt-2 grid grid-cols-3 gap-1 text-[10px] text-slate-500">
            {STAT_KEYS.map((stat) => (
              <div key={stat}>
                <dt className="text-slate-600">{SHIP_STAT_LABEL[stat]}</dt>
                <dd className="font-mono text-slate-300">{def.baseStats[stat]}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-3 flex items-center justify-between">
            <span className="text-[11px] text-slate-500">
              {def.creditPrice === null ? 'Awarded, not sold' : `${formatCredits(def.creditPrice)}c`}
              {' · '}Lv {def.requiredLevel}
            </span>
            <Button
              size="sm"
              variant="primary"
              disabled={def.creditPrice === null || busy}
              loading={busy}
              onClick={() =>
                void run(
                  async () => {
                    await api.post('/api/ships/buy', { defId: def.id });
                    await onReload();
                  },
                  { success: `${def.name} acquired` },
                )
              }
            >
              Purchase
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}
