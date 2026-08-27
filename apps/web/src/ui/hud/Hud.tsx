'use client';

import { useEffect, useState } from 'react';
import { STATION_AREAS, type StationAreaId } from '@nova/game-data';
import { AREA_COLORS, Meter } from '@nova/ui';
import { useGameStore } from '@/stores/useGameStore';
import { useNetStore } from '@/stores/useNetStore';
import { usePlayerStore } from '@/stores/usePlayerStore';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { fpsSample } from '@/game/systems/usePerformance';
import { formatCredits, shortAddress } from '@/lib/format';
import { InteractPrompt } from './InteractPrompt';
import { Toasts } from './Toasts';
import { ActionBar } from './ActionBar';
import { MissionTracker } from './MissionTracker';
import { ChatDock } from './ChatDock';
import { EmoteWheel } from './EmoteWheel';

/**
 * The heads-up display.
 *
 * Every element is `pointer-events-none` except the controls that need clicks,
 * so the HUD never steals a drag meant for the camera. Values come from the
 * player store, which only changes on a server response — the HUD does not
 * re-render per frame.
 */
export function Hud() {
  const player = usePlayerStore((state) => state.player);
  const area = useGameStore((state) => state.area);
  const onlineCount = useGameStore((state) => state.onlineCount);

  if (!player) return null;
  const areaName =
    area === 'corridor'
      ? 'Transit Corridor'
      : STATION_AREAS[area as Exclude<StationAreaId, 'corridor'>].name;

  return (
    <div className="pointer-events-none absolute inset-0 select-none">
      {/* Top bar */}
      <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-4 p-3 sm:p-4">
        <div className="pointer-events-auto flex items-center gap-3 border border-slate-700/60 bg-slate-950/80 px-3 py-2 backdrop-blur-md">
          <div>
            <p className="text-[10px] uppercase tracking-[0.3em] text-sky-300">Nova Station</p>
            <p
              className="text-xs font-medium tracking-wide"
              style={{ color: AREA_COLORS[area] ?? '#94a3b8' }}
            >
              {areaName}
            </p>
          </div>
        </div>

        <div className="pointer-events-auto flex items-center gap-2">
          <ConnectionPill />
          <div className="hidden items-center gap-3 border border-slate-700/60 bg-slate-950/80 px-3 py-2 backdrop-blur-md sm:flex">
            <div className="text-right">
              <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Commander</p>
              <p className="text-xs text-slate-200">{player.displayName}</p>
            </div>
            <div className="h-8 w-px bg-slate-700/70" />
            <div className="text-right">
              <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Level</p>
              <p className="font-mono text-sm text-sky-300">{player.level}</p>
            </div>
            <div className="h-8 w-px bg-slate-700/70" />
            <div className="text-right">
              <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Credits</p>
              <p className="font-mono text-sm text-amber-300">{formatCredits(player.credits)}</p>
            </div>
            <div className="h-8 w-px bg-slate-700/70" />
            <div className="text-right">
              <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Wallet</p>
              <p className="font-mono text-[11px] text-slate-400">{shortAddress(player.address)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* XP bar under the top strip */}
      <div className="absolute inset-x-0 top-[68px] px-3 sm:px-4">
        <div className="mx-auto max-w-md">
          <Meter
            value={player.xpIntoLevel}
            max={player.xpForLevel || 1}
            color="#38bdf8"
            height="thin"
          />
        </div>
      </div>

      {/* Vitals */}
      <div className="absolute bottom-3 left-3 w-52 space-y-2 sm:left-4">
        <Meter value={player.health} max={100} label="Hull" color="#4ade80" segments={10} />
        <Meter
          value={player.energy}
          max={player.energyMax}
          label="Energy"
          color="#38bdf8"
          segments={10}
        />
      </div>

      <PointerLockHint />
      <MissionTracker />
      <InteractPrompt />
      <ChatDock />
      <EmoteWheel />
      <Toasts />
      <ActionBar />

      <div className="absolute bottom-2 right-3 flex items-center gap-3 text-[10px] uppercase tracking-[0.18em] text-slate-600">
        <span>{onlineCount} aboard</span>
        <FpsCounter />
      </div>
    </div>
  );
}

/** Tells a new player how to take control of the camera. */
function PointerLockHint() {
  const locked = useGameStore((state) => state.pointerLocked);
  const panel = useGameStore((state) => state.panel);
  if (locked || panel) return null;

  return (
    <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
      <p className="border border-slate-700/60 bg-slate-950/70 px-4 py-2 text-[11px] uppercase tracking-[0.18em] text-slate-300 backdrop-blur-md">
        Click to look around · WASD to move
      </p>
    </div>
  );
}

function ConnectionPill() {
  const connection = useNetStore((state) => state.connection);
  const latency = useNetStore((state) => state.latencyMs);

  const label =
    connection === 'online'
      ? `${latency}ms`
      : connection === 'connecting'
        ? 'Linking'
        : connection === 'reconnecting'
          ? 'Reconnecting'
          : connection === 'failed'
            ? 'Offline'
            : 'Idle';

  const color =
    connection === 'online'
      ? latency < 90
        ? 'text-emerald-300'
        : latency < 220
          ? 'text-amber-300'
          : 'text-rose-300'
      : connection === 'failed'
        ? 'text-rose-400'
        : 'text-slate-400';

  return (
    <div className="flex items-center gap-2 border border-slate-700/60 bg-slate-950/80 px-3 py-2 backdrop-blur-md">
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          connection === 'online'
            ? 'bg-emerald-400'
            : connection === 'failed'
              ? 'bg-rose-500'
              : 'animate-pulse bg-amber-400'
        }`}
      />
      <span className={`font-mono text-[11px] ${color}`}>{label}</span>
    </div>
  );
}

function FpsCounter() {
  const show = useSettingsStore((state) => state.showFps);
  const [fps, setFps] = useState(0);

  useEffect(() => {
    if (!show) return undefined;
    const timer = window.setInterval(() => setFps(fpsSample.fps), 500);
    return () => window.clearInterval(timer);
  }, [show]);

  if (!show) return null;
  return (
    <span className={fps >= 55 ? 'text-emerald-400' : fps >= 35 ? 'text-amber-400' : 'text-rose-400'}>
      {fps} fps
    </span>
  );
}
