'use client';

import { useEffect, useRef, useState } from 'react';
import { MINING_MINIGAME, MINING_ZONES_BY_ID, RESOURCES } from '@nova/game-data';
import { Button, Meter } from '@nova/ui';
import type { ExtractResultDto } from '@nova/shared';
import { api } from '@/lib/api';
import { usePlayerStore } from '@/stores/usePlayerStore';
import { useGameStore } from '@/stores/useGameStore';
import { MINIGAME_TICK_MS, MINIGAME_TOTAL_TICKS, useMiningStore } from '@/stores/useMiningStore';
import { formatDuration } from '@/lib/format';
import { playMiningPulse, playOreCollected } from '@/game/audio/engine';

/**
 * The field HUD, including the resonance minigame.
 *
 * The minigame ticks on a fixed 10Hz interval rather than per frame, so a
 * player on a 144Hz monitor cannot accumulate more hold-ticks than one on 60Hz.
 * When it finishes, the tick count goes to the server — which clamps it and
 * decides the yield itself.
 */
export function MiningHud() {
  const expedition = usePlayerStore((state) => state.expedition);
  const refreshExpedition = usePlayerStore((state) => state.refreshExpedition);
  const refreshPlayer = usePlayerStore((state) => state.refreshPlayer);
  const refreshInventory = usePlayerStore((state) => state.refreshInventory);
  const setPhase = useGameStore((state) => state.setPhase);
  const toast = useGameStore((state) => state.toast);

  const target = useMiningStore((state) => state.target);
  const session = useMiningStore((state) => state.session);
  const begin = useMiningStore((state) => state.begin);
  const tick = useMiningStore((state) => state.tick);
  const end = useMiningStore((state) => state.end);
  const setSlew = useMiningStore((state) => state.setSlew);
  const lastResult = useMiningStore((state) => state.lastResult);
  const setResult = useMiningStore((state) => state.setResult);
  const submitting = useMiningStore((state) => state.submitting);
  const setSubmitting = useMiningStore((state) => state.setSubmitting);

  const [returning, setReturning] = useState(false);
  const submittedFor = useRef<number | null>(null);

  /* ------------------------------------------------- the minigame clock */
  useEffect(() => {
    if (!session) return undefined;
    const timer = window.setInterval(() => {
      const finished = tick();
      const current = useMiningStore.getState().session;
      if (current?.locked) playMiningPulse(current.holdTicks / MINIGAME_TOTAL_TICKS);
      if (finished) window.clearInterval(timer);
    }, MINIGAME_TICK_MS);
    return () => window.clearInterval(timer);
  }, [session?.nodeIndex, tick, session]);

  /* ------------------------------------------- submit when it completes */
  useEffect(() => {
    if (!session || !expedition) return;
    if (session.ticks < MINIGAME_TOTAL_TICKS) return;
    if (submittedFor.current === session.nodeIndex) return;
    submittedFor.current = session.nodeIndex;

    const holdTicks = end();
    setSubmitting(true);
    void (async () => {
      try {
        const response = await api.post<{ result: ExtractResultDto }>('/api/mining/extract', {
          expeditionId: expedition.id,
          nodeIndex: session.nodeIndex,
          holdTicks,
        });
        setResult(response.result);
        playOreCollected();
        if (response.result.overflow.length > 0) {
          toast({ kind: 'warn', title: 'Hold full — some ore was left behind' });
        }
        await refreshExpedition();
      } catch {
        toast({ kind: 'error', title: 'The extraction was rejected by station control.' });
      } finally {
        setSubmitting(false);
        submittedFor.current = null;
      }
    })();
  }, [session, expedition, end, setResult, setSubmitting, refreshExpedition, toast]);

  /* ------------------------------------------------------- beam control */
  useEffect(() => {
    if (!session) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.code === 'ArrowUp' || event.code === 'KeyW') setSlew(1);
      if (event.code === 'ArrowDown' || event.code === 'KeyS') setSlew(-1);
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (['ArrowUp', 'ArrowDown', 'KeyW', 'KeyS'].includes(event.code)) setSlew(0);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [session, setSlew]);

  /* -------------------------------------------------------- start mining */
  useEffect(() => {
    if (session || !target) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.code === 'KeyE' && target.distance < 14) {
        begin(target.index, target.resource);
        setResult(null);
      }
      if (event.code === 'KeyF' && expedition) {
        void api
          .post('/api/mining/scan', { expeditionId: expedition.id, nodeIndex: target.index })
          .then(() => {
            toast({ kind: 'success', title: 'Survey logged' });
            return refreshExpedition();
          })
          .catch(() => toast({ kind: 'warn', title: 'That rock is already logged.' }));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [session, target, begin, setResult, expedition, refreshExpedition, toast]);

  if (!expedition) return null;
  const zone = MINING_ZONES_BY_ID.get(expedition.zoneId);

  const goHome = () =>
    void (async () => {
      setReturning(true);
      try {
        const response = await api.post<{
          result: { haul: { resource: string; amount: number }[]; hazard: boolean; xp: number };
        }>('/api/mining/return', { expeditionId: expedition.id });

        toast({
          kind: response.result.hazard ? 'warn' : 'reward',
          title: response.result.hazard
            ? 'Hazard on the way home — some cargo was lost'
            : `Docked with ${response.result.haul.reduce((sum, entry) => sum + entry.amount, 0)} units`,
          detail: `+${response.result.xp} XP`,
          ttl: 8000,
        });
        await Promise.all([refreshExpedition(), refreshPlayer(), refreshInventory()]);
        setPhase('station');
      } catch {
        toast({ kind: 'error', title: 'Could not complete the docking sequence.' });
      } finally {
        setReturning(false);
      }
    })();

  return (
    <div className="pointer-events-none absolute inset-0 select-none">
      {/* Field status */}
      <div className="absolute left-3 top-3 border border-slate-700/60 bg-slate-950/80 px-3 py-2 backdrop-blur-md sm:left-4 sm:top-4">
        <p className="text-[10px] uppercase tracking-[0.28em] text-slate-500">Field</p>
        <p className="text-sm" style={{ color: zone?.palette.star }}>
          {zone?.name ?? expedition.zoneId}
        </p>
        <div className="mt-2 w-40 space-y-1.5">
          <Meter
            value={expedition.cargoUsed}
            max={expedition.cargoCapacity || 1}
            label="Hold"
            color="#f97316"
            height="thin"
            showValue
          />
          <Meter
            value={expedition.fuelRemaining}
            max={Math.max(expedition.fuelRemaining, 1)}
            label="Fuel"
            color="#22d3ee"
            height="thin"
          />
        </div>
        <p className="mt-2 text-[10px] text-slate-500">
          {expedition.minedNodes.length} worked · {expedition.scannedNodes.length} logged
        </p>
      </div>

      {/* Return home */}
      <div className="pointer-events-auto absolute right-3 top-3 sm:right-4 sm:top-4">
        <Button variant="primary" loading={returning} onClick={goHome}>
          Return to station
        </Button>
      </div>

      {/* Target prompt */}
      {!session && target && (
        <div className="absolute bottom-32 left-1/2 -translate-x-1/2 text-center">
          <p className="text-[11px] uppercase tracking-[0.2em]" style={{ color: RESOURCES[target.resource].color }}>
            {RESOURCES[target.resource].name} · {target.distance.toFixed(0)}m
          </p>
          <div className="mt-1.5 flex items-center gap-2">
            <kbd className="border border-sky-400/70 bg-sky-500/15 px-2 py-1 font-mono text-[11px] text-sky-200">
              E
            </kbd>
            <span className="text-[11px] text-slate-300">Engage beam</span>
            <kbd className="ml-3 border border-slate-600 bg-slate-900 px-2 py-1 font-mono text-[11px] text-slate-300">
              F
            </kbd>
            <span className="text-[11px] text-slate-400">Survey scan</span>
          </div>
        </div>
      )}

      {/* The resonance minigame */}
      {session && <ResonanceGauge />}

      {/* Extraction result */}
      {lastResult && !session && (
        <div className="pointer-events-auto absolute bottom-32 left-1/2 w-72 -translate-x-1/2 border border-emerald-500/40 bg-slate-950/90 p-3 backdrop-blur-md">
          <p className="text-[10px] uppercase tracking-[0.2em] text-emerald-300">
            Extraction complete · ×{lastResult.multiplier.toFixed(2)}
          </p>
          <ul className="mt-1.5 space-y-0.5">
            {lastResult.yields.map((entry) => (
              <li key={entry.resource} className="flex justify-between text-[11px]">
                <span style={{ color: RESOURCES[entry.resource].color }}>
                  {RESOURCES[entry.resource].name}
                </span>
                <span className="font-mono text-slate-300">+{entry.amount}</span>
              </li>
            ))}
            {lastResult.yields.length === 0 && (
              <li className="text-[11px] text-slate-500">Nothing recoverable — the hold is full.</li>
            )}
          </ul>
          <Button size="sm" variant="ghost" className="mt-2" onClick={() => setResult(null)}>
            Dismiss
          </Button>
        </div>
      )}

      {submitting && (
        <p className="absolute bottom-24 left-1/2 -translate-x-1/2 text-[11px] text-slate-400">
          Station control is verifying the extraction…
        </p>
      )}

      {/* Flight controls reminder */}
      <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-3 text-[10px] uppercase tracking-[0.14em] text-slate-600">
        <span>W/S throttle</span>
        <span>A/D strafe</span>
        <span>Mouse steer</span>
        <span>Shift boost</span>
      </div>
    </div>
  );
}

/**
 * The gauge itself.
 *
 * A drifting band and a beam marker on a vertical frequency axis. Holding the
 * marker inside the band is the whole skill, and the bar underneath shows
 * exactly how much of the run was spent locked on.
 */
function ResonanceGauge() {
  const session = useMiningStore((state) => state.session);
  if (!session) return null;

  const progress = session.ticks / MINIGAME_TOTAL_TICKS;
  const accuracy = session.ticks > 0 ? session.holdTicks / session.ticks : 0;
  const resource = RESOURCES[session.resource];

  return (
    <div className="pointer-events-none absolute bottom-24 left-1/2 -translate-x-1/2">
      <div className="border border-slate-700/60 bg-slate-950/90 p-4 backdrop-blur-md">
        <div className="mb-2 flex items-baseline justify-between gap-6">
          <span className="text-[10px] uppercase tracking-[0.2em]" style={{ color: resource.color }}>
            {resource.name}
          </span>
          <span
            className={`font-mono text-[11px] ${session.locked ? 'text-emerald-300' : 'text-slate-500'}`}
          >
            {session.locked ? 'RESONANCE LOCKED' : 'DRIFTING'}
          </span>
        </div>

        <div className="flex items-stretch gap-3">
          {/* Frequency axis */}
          <div className="relative h-40 w-14 border border-slate-700 bg-slate-900/70">
            {/* The band to hold */}
            <div
              className={`absolute inset-x-0 transition-colors ${
                session.locked ? 'bg-emerald-400/30' : 'bg-sky-400/20'
              }`}
              style={{
                bottom: `${(session.band - MINING_MINIGAME.bandHalfWidth) * 100}%`,
                height: `${MINING_MINIGAME.bandHalfWidth * 2 * 100}%`,
              }}
            />
            {/* The beam marker */}
            <div
              className="absolute inset-x-0 h-0.5 bg-white shadow-[0_0_10px_rgba(255,255,255,0.9)]"
              style={{ bottom: `${session.beam * 100}%` }}
            />
          </div>

          <div className="flex flex-col justify-between py-1">
            <div className="flex flex-col gap-1">
              <kbd className="border border-slate-600 bg-slate-900 px-2 py-0.5 text-center font-mono text-[10px] text-slate-300">
                W
              </kbd>
              <kbd className="border border-slate-600 bg-slate-900 px-2 py-0.5 text-center font-mono text-[10px] text-slate-300">
                S
              </kbd>
            </div>
            <span className="font-mono text-[10px] text-slate-600">tune</span>
          </div>

          <div className="flex w-40 flex-col justify-end gap-2">
            <div>
              <p className="mb-1 text-[10px] uppercase tracking-[0.16em] text-slate-500">Lock quality</p>
              <div className="h-1.5 w-full bg-slate-800">
                <div
                  className="h-full bg-emerald-400 transition-[width] duration-100"
                  style={{ width: `${accuracy * 100}%` }}
                />
              </div>
              <p className="mt-1 font-mono text-[10px] text-slate-500">
                {Math.round(accuracy * 100)}% · yield ×
                {(
                  MINING_MINIGAME.minMultiplier +
                  (MINING_MINIGAME.maxMultiplier - MINING_MINIGAME.minMultiplier) * accuracy
                ).toFixed(2)}
              </p>
            </div>
            <div>
              <div className="h-1 w-full bg-slate-800">
                <div
                  className="h-full bg-sky-400 transition-[width] duration-100"
                  style={{ width: `${progress * 100}%` }}
                />
              </div>
              <p className="mt-1 font-mono text-[10px] text-slate-600">
                {formatDuration(Math.ceil((MINIGAME_TOTAL_TICKS - session.ticks) / MINING_MINIGAME.tickHz))}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
