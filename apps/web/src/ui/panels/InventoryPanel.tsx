'use client';

import { useMemo, useState } from 'react';
import { Badge, Button, Meter, RARITY_TEXT, Tabs } from '@nova/ui';
import type { InventoryEntryDto } from '@nova/shared';
import { api } from '@/lib/api';
import { usePlayerStore } from '@/stores/usePlayerStore';
import { useGameStore } from '@/stores/useGameStore';
import { formatCredits } from '@/lib/format';
import { useAction } from './usePanelData';

const CATEGORIES = [
  { id: 'all', label: 'All' },
  { id: 'resource', label: 'Resources' },
  { id: 'module', label: 'Modules' },
  { id: 'equipment', label: 'Equipment' },
  { id: 'cosmetic', label: 'Cosmetics' },
] as const;

type SortKey = 'name' | 'amount' | 'value' | 'rarity';

const RARITY_ORDER = ['legendary', 'epic', 'rare', 'uncommon', 'common'];

/**
 * The inventory.
 *
 * Off-chain items and on-chain tokens sit in the same list but are never
 * conflated: anything with a token behind it is marked, and the marker is the
 * indexed chain state rather than a local guess.
 */
export function InventoryPanel() {
  const inventory = usePlayerStore((state) => state.inventory);
  const refreshInventory = usePlayerStore((state) => state.refreshInventory);
  const refreshPlayer = usePlayerStore((state) => state.refreshPlayer);
  const openPanel = useGameStore((state) => state.openPanel);
  const { run, busy } = useAction();

  const [category, setCategory] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortKey>('rarity');

  const entries = useMemo(() => {
    const list = (inventory?.entries ?? []).filter((entry) => {
      if (category !== 'all' && entry.kind !== category) return false;
      if (!search) return true;
      return entry.name.toLowerCase().includes(search.toLowerCase());
    });

    return [...list].sort((a, b) => {
      switch (sort) {
        case 'amount':
          return b.amount - a.amount;
        case 'value':
          return b.value * b.amount - a.value * a.amount;
        case 'rarity':
          return RARITY_ORDER.indexOf(a.rarity) - RARITY_ORDER.indexOf(b.rarity);
        default:
          return a.name.localeCompare(b.name);
      }
    });
  }, [inventory, category, search, sort]);

  const toggleEquip = (entry: InventoryEntryDto) =>
    void run(
      async () => {
        const route = entry.equipped ? '/api/inventory/unequip' : '/api/inventory/equip';
        await api.post(route, { kind: entry.kind, defId: entry.defId });
        await refreshInventory();
        await refreshPlayer();
      },
      { success: entry.equipped ? `${entry.name} stowed` : `${entry.name} equipped` },
    );

  if (!inventory) return <p className="py-8 text-center text-xs text-slate-500">Loading…</p>;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-4">
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Credits</p>
            <p className="font-mono text-sm text-amber-300">{formatCredits(inventory.credits)}</p>
          </div>
          <div className="w-40">
            <Meter
              value={inventory.cargoUsed}
              max={inventory.cargoCapacity || 1}
              label="Cargo"
              color="#f97316"
              showValue
              height="thin"
            />
          </div>
        </div>
        <Button size="sm" variant="ghost" onClick={() => openPanel('assets')}>
          On-chain assets →
        </Button>
      </div>

      <Tabs
        items={CATEGORIES.map((entry) => ({ id: entry.id, label: entry.label }))}
        active={category}
        onChange={setCategory}
        className="mb-3"
      />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search inventory…"
          aria-label="Search inventory"
          className="flex-1 border border-slate-700/60 bg-slate-900/60 px-2 py-1.5 text-xs text-slate-200 outline-none placeholder:text-slate-600 focus:border-sky-500/60"
        />
        <select
          value={sort}
          onChange={(event) => setSort(event.target.value as SortKey)}
          aria-label="Sort inventory"
          className="border border-slate-700/60 bg-slate-900/60 px-2 py-1.5 text-xs text-slate-300 outline-none focus:border-sky-500/60"
        >
          <option value="rarity">Rarity</option>
          <option value="name">Name</option>
          <option value="amount">Quantity</option>
          <option value="value">Value</option>
        </select>
      </div>

      {entries.length === 0 ? (
        <p className="py-10 text-center text-xs text-slate-500">Nothing here yet.</p>
      ) : (
        <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          {entries.map((entry) => (
            <li
              key={`${entry.kind}:${entry.defId}`}
              className="flex items-center gap-3 border border-slate-800/70 bg-slate-900/40 p-2"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center border border-slate-700/60 bg-slate-950/70">
                <span className={`text-sm ${RARITY_TEXT[entry.rarity]}`}>
                  {entry.kind === 'resource' ? '◆' : entry.kind === 'module' ? '⚙' : entry.kind === 'equipment' ? '⛨' : '✦'}
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className={`truncate text-xs ${RARITY_TEXT[entry.rarity]}`}>{entry.name}</span>
                  {entry.onChainAmount > 0 && (
                    <Badge color="#c084fc" className="shrink-0">
                      ⛓ {entry.onChainAmount}
                    </Badge>
                  )}
                </div>
                <p className="text-[10px] text-slate-500">
                  ×{entry.amount}
                  {entry.value > 0 && ` · ${formatCredits(entry.value)}c each`}
                </p>
              </div>
              {(entry.kind === 'equipment' || entry.kind === 'cosmetic') && (
                <Button
                  size="sm"
                  variant={entry.equipped ? 'ghost' : 'secondary'}
                  loading={busy}
                  onClick={() => toggleEquip(entry)}
                >
                  {entry.equipped ? 'Stow' : 'Equip'}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
