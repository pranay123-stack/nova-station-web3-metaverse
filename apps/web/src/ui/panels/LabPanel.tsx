'use client';

import { RECIPES, RECIPES_BY_ID, RESOURCES } from '@nova/game-data';
import { Badge, Button, RARITY_TEXT } from '@nova/ui';
import type { CraftDto } from '@nova/shared';
import { api } from '@/lib/api';
import { usePlayerStore } from '@/stores/usePlayerStore';
import { formatCredits, formatDuration } from '@/lib/format';
import { playSuccess } from '@/game/audio/engine';
import { useAction } from './usePanelData';
import { useEffect, useState } from 'react';

/** Crafting: start a job, watch the bench, collect the output. */
export function LabPanel() {
  const crafts = usePlayerStore((state) => state.crafts);
  const inventory = usePlayerStore((state) => state.inventory);
  const player = usePlayerStore((state) => state.player);
  const refreshCrafts = usePlayerStore((state) => state.refreshCrafts);
  const refreshInventory = usePlayerStore((state) => state.refreshInventory);
  const refreshPlayer = usePlayerStore((state) => state.refreshPlayer);
  const { run, busy } = useAction();

  const held = new Map(
    (inventory?.entries ?? [])
      .filter((entry) => entry.kind === 'resource')
      .map((entry) => [entry.defId, entry.amount]),
  );

  const reload = async () => {
    await Promise.all([refreshCrafts(), refreshInventory(), refreshPlayer()]);
  };

  return (
    <div className="space-y-4">
      {crafts.length > 0 && (
        <section>
          <h3 className="mb-2 text-[10px] uppercase tracking-[0.2em] text-slate-500">Benches</h3>
          <ul className="space-y-1.5">
            {crafts.map((craft) => (
              <CraftRow key={craft.id} craft={craft} busy={busy} run={run} onReload={reload} />
            ))}
          </ul>
        </section>
      )}

      <section>
        <h3 className="mb-2 text-[10px] uppercase tracking-[0.2em] text-slate-500">Schematics</h3>
        <ul className="space-y-1.5">
          {RECIPES.map((recipe) => {
            const short = recipe.inputs.filter(
              (input) => (held.get(input.resource) ?? 0) < input.amount,
            );
            const affordable =
              short.length === 0 &&
              (player?.credits ?? 0) >= recipe.creditCost &&
              (player?.level ?? 1) >= recipe.requiredLevel;

            return (
              <li
                key={recipe.id}
                className={`border p-3 ${
                  affordable ? 'border-slate-700/60 bg-slate-900/40' : 'border-slate-800/60 bg-slate-900/20'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm text-slate-100">{recipe.name}</p>
                    <p className="mt-0.5 text-[11px] text-slate-400">{recipe.description}</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {recipe.inputs.map((input) => {
                        const have = held.get(input.resource) ?? 0;
                        const enough = have >= input.amount;
                        return (
                          <span
                            key={input.resource}
                            className={`border px-1.5 py-0.5 text-[10px] ${
                              enough
                                ? 'border-slate-700 text-slate-300'
                                : 'border-rose-500/50 text-rose-300'
                            }`}
                          >
                            {RESOURCES[input.resource].name} {have}/{input.amount}
                          </span>
                        );
                      })}
                      <span className="border border-amber-500/40 px-1.5 py-0.5 text-[10px] text-amber-300">
                        {formatCredits(recipe.creditCost)}c
                      </span>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <span className="text-[10px] text-slate-500">
                      Lv {recipe.requiredLevel} · {formatDuration(recipe.durationSec)}
                    </span>
                    <Button
                      size="sm"
                      variant="primary"
                      disabled={!affordable || busy}
                      loading={busy}
                      onClick={() =>
                        void run(
                          async () => {
                            await api.post('/api/crafting/start', { recipeId: recipe.id });
                            await reload();
                          },
                          { success: `${recipe.name} queued` },
                        )
                      }
                    >
                      Fabricate
                    </Button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

function CraftRow({
  craft,
  busy,
  run,
  onReload,
}: {
  craft: CraftDto;
  busy: boolean;
  run: ReturnType<typeof useAction>['run'];
  onReload: () => Promise<void>;
}) {
  const recipe = RECIPES_BY_ID.get(craft.recipeId);
  const [remaining, setRemaining] = useState(craft.secondsRemaining);

  // A local countdown so the bench reads live without polling the server.
  useEffect(() => {
    setRemaining(craft.secondsRemaining);
    if (craft.secondsRemaining <= 0) return undefined;
    const timer = window.setInterval(() => {
      setRemaining((value) => Math.max(0, value - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [craft.id, craft.secondsRemaining]);

  if (!recipe) return null;
  const ready = remaining <= 0;
  const fraction = 1 - remaining / Math.max(1, recipe.durationSec);

  return (
    <li className="border border-slate-700/60 bg-slate-900/40 p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className={`text-xs ${RARITY_TEXT.rare}`}>{recipe.name}</p>
          <div className="mt-1.5 h-1 w-full bg-slate-800">
            <div
              className={`h-full transition-[width] duration-1000 ${ready ? 'bg-emerald-400' : 'bg-sky-400'}`}
              style={{ width: `${Math.min(100, fraction * 100)}%` }}
            />
          </div>
        </div>
        {ready ? (
          <Button
            size="sm"
            variant="success"
            loading={busy}
            onClick={() =>
              void run(async () => {
                const result = await api.post<{
                  result: { outputId: string; amount: number; bonusApplied: boolean };
                }>('/api/crafting/collect', { craftId: craft.id });
                playSuccess();
                await onReload();
                return result;
              }, { success: 'Fabrication collected' })
            }
          >
            Collect
          </Button>
        ) : (
          <Badge>{formatDuration(remaining)}</Badge>
        )}
      </div>
    </li>
  );
}
