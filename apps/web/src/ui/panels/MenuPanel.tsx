'use client';

import { Button, Meter, Tabs } from '@nova/ui';
import { useState } from 'react';
import { FACTIONS, FACTION_IDS } from '@nova/game-data';
import { useSettingsStore, type QualityLevel } from '@/stores/useSettingsStore';
import { usePlayerStore } from '@/stores/usePlayerStore';
import { useAuthStore } from '@/stores/useAuthStore';
import { useGameStore } from '@/stores/useGameStore';
import { applyVolumes } from '@/game/audio/engine';
import { formatCredits, formatPlaytime, shortAddress } from '@/lib/format';

/** Settings, accessibility, profile summary and sign-out. */
export function MenuPanel() {
  const [tab, setTab] = useState('profile');

  return (
    <div>
      <Tabs
        items={[
          { id: 'profile', label: 'Commander' },
          { id: 'graphics', label: 'Graphics' },
          { id: 'audio', label: 'Audio' },
          { id: 'access', label: 'Accessibility' },
          { id: 'controls', label: 'Controls' },
        ]}
        active={tab}
        onChange={setTab}
        className="mb-4"
      />
      {tab === 'profile' && <ProfileTab />}
      {tab === 'graphics' && <GraphicsTab />}
      {tab === 'audio' && <AudioTab />}
      {tab === 'access' && <AccessibilityTab />}
      {tab === 'controls' && <ControlsTab />}
    </div>
  );
}

function ProfileTab() {
  const player = usePlayerStore((state) => state.player);
  const signOut = useAuthStore((state) => state.signOut);
  const reset = useGameStore((state) => state.reset);
  if (!player) return null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Level', value: player.level },
          { label: 'Credits', value: formatCredits(player.credits) },
          { label: 'Missions', value: player.stats.missionsCompleted },
          { label: 'Ore mined', value: formatCredits(player.stats.resourcesMined) },
          { label: 'Expeditions', value: player.stats.expeditions },
          { label: 'Crafted', value: player.stats.itemsCrafted },
          { label: 'Trades', value: player.stats.trades },
          { label: 'Playtime', value: formatPlaytime(player.playtimeSec) },
        ].map((stat) => (
          <div key={stat.label} className="border border-slate-800/70 bg-slate-900/40 p-2">
            <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">{stat.label}</p>
            <p className="font-mono text-sm text-slate-200">{stat.value}</p>
          </div>
        ))}
      </div>

      <div>
        <h3 className="mb-2 text-[10px] uppercase tracking-[0.2em] text-slate-500">Standing</h3>
        <div className="space-y-2">
          {FACTION_IDS.map((id) => {
            const faction = FACTIONS[id];
            const reputation = player.reputation[id];
            const rank = player.ranks[id];
            const floor = faction.rankThresholds[rank] ?? 0;
            const ceiling = faction.rankThresholds[rank + 1] ?? reputation;
            return (
              <div key={id}>
                <div className="flex items-baseline justify-between">
                  <span className="text-[11px]" style={{ color: faction.color }}>
                    {faction.name}
                  </span>
                  <span className="text-[10px] text-slate-500">
                    {player.rankNames[id]} · {reputation.toLocaleString()}
                  </span>
                </div>
                <Meter
                  value={reputation - floor}
                  max={Math.max(1, ceiling - floor)}
                  color={faction.color}
                  height="thin"
                />
              </div>
            );
          })}
        </div>
        <p className="mt-2 text-[11px] text-slate-500">
          Market fee discount: {Math.round(player.feeDiscount * 100)}%
        </p>
      </div>

      <div className="flex items-center justify-between border-t border-slate-800 pt-3">
        <p className="font-mono text-[11px] text-slate-500">{shortAddress(player.address)}</p>
        <Button
          variant="danger"
          size="sm"
          onClick={() => {
            void signOut();
            reset();
          }}
        >
          Sign out
        </Button>
      </div>
    </div>
  );
}

function GraphicsTab() {
  const quality = useSettingsStore((state) => state.quality);
  const autoApplied = useSettingsStore((state) => state.autoQualityApplied);
  const showFps = useSettingsStore((state) => state.showFps);
  const nameplates = useSettingsStore((state) => state.showNameplates);
  const set = useSettingsStore((state) => state.set);

  return (
    <div className="space-y-4">
      <fieldset>
        <legend className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Quality</legend>
        <div className="mt-1.5 flex gap-1.5">
          {(['low', 'medium', 'high'] as QualityLevel[]).map((level) => (
            <Button
              key={level}
              size="sm"
              variant={quality === level ? 'primary' : 'secondary'}
              onClick={() => set('quality', level)}
            >
              {level}
            </Button>
          ))}
        </div>
        {autoApplied && (
          <p className="mt-1.5 text-[11px] text-amber-400/80">
            Quality was lowered automatically to hold the frame rate. Set it back if your hardware can
            take it.
          </p>
        )}
        <p className="mt-1.5 text-[11px] text-slate-500">
          High enables bloom and the full star field. Low drops post-processing, holograms and all but
          one light per sector.
        </p>
      </fieldset>

      <Toggle label="Show frame rate" checked={showFps} onChange={(value) => set('showFps', value)} />
      <Toggle
        label="Show player nameplates"
        checked={nameplates}
        onChange={(value) => set('showNameplates', value)}
      />
    </div>
  );
}

function AudioTab() {
  const settings = useSettingsStore();

  const slider = (
    label: string,
    key: 'masterVolume' | 'musicVolume' | 'sfxVolume',
  ) => (
    <div key={key}>
      <div className="flex items-baseline justify-between">
        <label htmlFor={key} className="text-[10px] uppercase tracking-[0.2em] text-slate-500">
          {label}
        </label>
        <span className="font-mono text-[11px] text-slate-400">
          {Math.round(settings[key] * 100)}%
        </span>
      </div>
      <input
        id={key}
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={settings[key]}
        onChange={(event) => {
          settings.set(key, Number(event.target.value));
          applyVolumes();
        }}
        className="mt-1 w-full accent-sky-400"
      />
    </div>
  );

  return (
    <div className="space-y-3">
      <Toggle
        label="Mute all audio"
        checked={settings.muted}
        onChange={(value) => {
          settings.set('muted', value);
          applyVolumes();
        }}
      />
      {slider('Master', 'masterVolume')}
      {slider('Ambience', 'musicVolume')}
      {slider('Effects', 'sfxVolume')}
      <p className="text-[11px] leading-relaxed text-slate-500">
        Every sound in NOVA STATION is synthesised in the browser — there are no audio files to
        download and nothing licensed from anyone.
      </p>
    </div>
  );
}

function AccessibilityTab() {
  const settings = useSettingsStore();

  return (
    <div className="space-y-3">
      <Toggle
        label="Reduce motion"
        description="Removes camera smoothing, hologram spin and background drift."
        checked={settings.reducedMotion}
        onChange={(value) => settings.set('reducedMotion', value)}
      />
      <Toggle
        label="High contrast interface"
        description="Stronger panel borders and brighter text."
        checked={settings.highContrast}
        onChange={(value) => settings.set('highContrast', value)}
      />
      <div>
        <div className="flex items-baseline justify-between">
          <label htmlFor="sensitivity" className="text-[10px] uppercase tracking-[0.2em] text-slate-500">
            Look sensitivity
          </label>
          <span className="font-mono text-[11px] text-slate-400">
            {settings.mouseSensitivity.toFixed(1)}×
          </span>
        </div>
        <input
          id="sensitivity"
          type="range"
          min={0.3}
          max={2.5}
          step={0.1}
          value={settings.mouseSensitivity}
          onChange={(event) => settings.set('mouseSensitivity', Number(event.target.value))}
          className="mt-1 w-full accent-sky-400"
        />
      </div>
      <Toggle
        label="Invert vertical look"
        checked={settings.invertY}
        onChange={(value) => settings.set('invertY', value)}
      />
    </div>
  );
}

function ControlsTab() {
  const bindings = [
    ['W A S D', 'Move'],
    ['Mouse', 'Look'],
    ['Shift', 'Run'],
    ['Space', 'Jump'],
    ['E', 'Interact'],
    ['Enter', 'Chat'],
    ['G (hold)', 'Emotes'],
    ['J', 'Missions'],
    ['I / Tab', 'Inventory'],
    ['M', 'Station map'],
    ['P', 'Crew'],
    ['Esc', 'Menu'],
    ['Scroll', 'Zoom camera'],
  ];

  return (
    <dl className="grid grid-cols-1 gap-1 sm:grid-cols-2">
      {bindings.map(([key, action]) => (
        <div
          key={key}
          className="flex items-center justify-between border border-slate-800/70 bg-slate-900/40 px-3 py-1.5"
        >
          <dt>
            <kbd className="border border-slate-700 bg-slate-950 px-1.5 py-0.5 font-mono text-[10px] text-slate-300">
              {key}
            </kbd>
          </dt>
          <dd className="text-[11px] text-slate-400">{action}</dd>
        </div>
      ))}
    </dl>
  );
}

function Toggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-3 border border-slate-800/70 bg-slate-900/40 px-3 py-2">
      <span>
        <span className="text-[11px] text-slate-200">{label}</span>
        {description && <span className="mt-0.5 block text-[10px] text-slate-500">{description}</span>}
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 accent-sky-500"
      />
    </label>
  );
}
