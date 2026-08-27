'use client';

import { useMemo, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { COSMETICS, EQUIPMENT, type CosmeticSlot } from '@nova/game-data';
import { Button, RARITY_TEXT } from '@nova/ui';
import { api } from '@/lib/api';
import { usePlayerStore } from '@/stores/usePlayerStore';
import { Avatar, DEFAULT_LOOK, type AvatarLook } from '@/game/scene/Avatar';
import { useAction } from './usePanelData';

const SUIT_COLORS = [
  '#38bdf8',
  '#5eead4',
  '#fbbf24',
  '#f43f5e',
  '#c084fc',
  '#4ade80',
  '#e2e8f0',
  '#f97316',
];

const SLOTS: readonly { slot: CosmeticSlot; label: string; field: keyof AvatarLook }[] = [
  { slot: 'suitPattern', label: 'Suit finish', field: 'suitPattern' },
  { slot: 'visor', label: 'Visor', field: 'visor' },
  { slot: 'emblem', label: 'Emblem', field: 'emblem' },
  { slot: 'accessory', label: 'Accessory', field: 'accessory' },
];

/**
 * The suit locker.
 *
 * The preview is the *same* `Avatar` component the world renders, in its own
 * small canvas — so what a player sees here is exactly what everyone else will
 * see on the station, rather than an approximation that drifts.
 */
export function AvatarPanel() {
  const avatar = usePlayerStore((state) => state.avatar);
  const inventory = usePlayerStore((state) => state.inventory);
  const player = usePlayerStore((state) => state.player);
  const setAvatar = usePlayerStore((state) => state.setAvatar);
  const refreshPlayer = usePlayerStore((state) => state.refreshPlayer);
  const { run, busy } = useAction();

  const [draft, setDraft] = useState<AvatarLook & { displayName: string }>(() => ({
    ...DEFAULT_LOOK,
    ...(avatar ?? {}),
    displayName: avatar?.displayName ?? player?.displayName ?? 'Commander',
  }));

  const owned = useMemo(
    () =>
      new Set(
        (inventory?.entries ?? [])
          .filter((entry) => entry.kind === 'cosmetic' || entry.kind === 'equipment')
          .map((entry) => entry.defId),
      ),
    [inventory],
  );

  const suits = EQUIPMENT.filter((item) => item.slot === 'suit' && owned.has(item.id));
  const helmets = EQUIPMENT.filter((item) => item.slot === 'helmet' && owned.has(item.id));

  const save = () =>
    void run(
      async () => {
        await api.put('/api/player/avatar', draft);
        setAvatar({ ...draft });
        await refreshPlayer();
      },
      { success: 'Suit configuration saved' },
    );

  return (
    <div className="grid gap-4 md:grid-cols-[260px_1fr]">
      <div className="h-72 border border-slate-800 bg-slate-950/70">
        <Canvas camera={{ position: [0, 1.4, 3.4], fov: 40 }} dpr={[1, 1.6]}>
          <ambientLight intensity={0.7} />
          <directionalLight position={[3, 5, 4]} intensity={1.4} />
          <pointLight position={[-3, 2, 2]} intensity={18} color="#38bdf8" distance={12} />
          <group position={[0, -0.9, 0]} rotation={[0, 0.5, 0]}>
            <Avatar look={draft} speed={0} scale={1.15} />
          </group>
        </Canvas>
      </div>

      <div className="space-y-3">
        <div>
          <label htmlFor="display-name" className="text-[10px] uppercase tracking-[0.2em] text-slate-500">
            Commander name
          </label>
          <input
            id="display-name"
            value={draft.displayName}
            maxLength={20}
            onChange={(event) => setDraft((current) => ({ ...current, displayName: event.target.value }))}
            className="mt-1 w-full border border-slate-700/60 bg-slate-900/60 px-2 py-1.5 text-xs text-slate-200 outline-none focus:border-sky-500/60"
          />
        </div>

        <fieldset>
          <legend className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Suit</legend>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {suits.map((suit) => (
              <button
                key={suit.id}
                type="button"
                aria-pressed={draft.suitId === suit.id}
                onClick={() => setDraft((current) => ({ ...current, suitId: suit.id }))}
                className={`border px-2 py-1 text-[11px] transition-colors ${
                  draft.suitId === suit.id
                    ? 'border-sky-500/70 bg-sky-500/15 text-sky-200'
                    : `border-slate-700/60 ${RARITY_TEXT[suit.rarity]} hover:border-slate-500`
                }`}
              >
                {suit.name}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Helmet</legend>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {helmets.map((helmet) => (
              <button
                key={helmet.id}
                type="button"
                aria-pressed={draft.helmetId === helmet.id}
                onClick={() => setDraft((current) => ({ ...current, helmetId: helmet.id }))}
                className={`border px-2 py-1 text-[11px] transition-colors ${
                  draft.helmetId === helmet.id
                    ? 'border-sky-500/70 bg-sky-500/15 text-sky-200'
                    : `border-slate-700/60 ${RARITY_TEXT[helmet.rarity]} hover:border-slate-500`
                }`}
              >
                {helmet.name}
              </button>
            ))}
          </div>
        </fieldset>

        {SLOTS.map(({ slot, label, field }) => {
          const options = COSMETICS.filter((item) => item.slot === slot && owned.has(item.id));
          if (options.length === 0) return null;
          return (
            <fieldset key={slot}>
              <legend className="text-[10px] uppercase tracking-[0.2em] text-slate-500">{label}</legend>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {options.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    aria-pressed={draft[field] === option.id}
                    onClick={() => setDraft((current) => ({ ...current, [field]: option.id }))}
                    className={`border px-2 py-1 text-[11px] transition-colors ${
                      draft[field] === option.id
                        ? 'border-sky-500/70 bg-sky-500/15 text-sky-200'
                        : `border-slate-700/60 ${RARITY_TEXT[option.rarity]} hover:border-slate-500`
                    }`}
                  >
                    {option.name}
                  </button>
                ))}
              </div>
            </fieldset>
          );
        })}

        <fieldset>
          <legend className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Colours</legend>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {SUIT_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                aria-label={`Primary colour ${color}`}
                aria-pressed={draft.primaryColor === color}
                onClick={() => setDraft((current) => ({ ...current, primaryColor: color }))}
                className={`h-7 w-7 border-2 transition-transform ${
                  draft.primaryColor === color ? 'scale-110 border-white' : 'border-slate-700'
                }`}
                style={{ background: color }}
              />
            ))}
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {['#0f172a', '#1e293b', '#334155', '#3f2a1c', '#231a35', '#0b2b2b'].map((color) => (
              <button
                key={color}
                type="button"
                aria-label={`Trim colour ${color}`}
                aria-pressed={draft.secondaryColor === color}
                onClick={() => setDraft((current) => ({ ...current, secondaryColor: color }))}
                className={`h-6 w-6 border-2 transition-transform ${
                  draft.secondaryColor === color ? 'scale-110 border-white' : 'border-slate-700'
                }`}
                style={{ background: color }}
              />
            ))}
          </div>
        </fieldset>

        <div className="flex justify-end gap-2 border-t border-slate-800 pt-3">
          <Button
            variant="ghost"
            onClick={() =>
              setDraft({
                ...DEFAULT_LOOK,
                ...(avatar ?? {}),
                displayName: avatar?.displayName ?? 'Commander',
              })
            }
          >
            Reset
          </Button>
          <Button variant="primary" loading={busy} onClick={save}>
            Save configuration
          </Button>
        </div>
      </div>
    </div>
  );
}
