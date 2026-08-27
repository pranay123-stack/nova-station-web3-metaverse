'use client';

import { useState } from 'react';
import {
  FACTIONS,
  MISSIONS_BY_ID,
  MISSION_TYPE_ICON,
  MISSION_TYPE_LABEL,
  RESOURCES,
  type MissionDef,
  type MissionObjective,
} from '@nova/game-data';
import { Badge, Button, Tabs } from '@nova/ui';
import type { ActiveMissionDto, MissionOfferDto } from '@nova/shared';
import { api } from '@/lib/api';
import { usePlayerStore } from '@/stores/usePlayerStore';
import { useGameStore } from '@/stores/useGameStore';
import { formatCredits, formatDuration, stars } from '@/lib/format';
import { playLevelUp, playSuccess } from '@/game/audio/engine';
import { useAction, usePanelData } from './usePanelData';

/** Objective text is generated from the definition, never hardcoded per mission. */
function describeObjective(objective: MissionObjective): string {
  switch (objective.kind) {
    case 'mine':
      return `Extract ${objective.amount} ${RESOURCES[objective.resource].name}`;
    case 'mine_any':
      return `Extract ${objective.amount} units of ore`;
    case 'deliver':
      return `Deliver ${objective.amount} ${RESOURCES[objective.resource].name}`;
    case 'visit':
      return `Report to the ${objective.area.replace('_', ' ')}`;
    case 'scan':
      return `Log ${objective.amount} survey scans`;
    case 'craft':
      return `Fabricate ${objective.amount}× the commissioned item`;
    case 'refine':
      return `Process ${objective.amount} units through the refinery`;
    case 'expedition':
      return `Complete ${objective.amount} expedition${objective.amount > 1 ? 's' : ''}`;
    case 'sell':
      return `Complete ${objective.amount} marketplace sales`;
    default:
      return 'Complete the objective';
  }
}

export function MissionsPanel() {
  const [tab, setTab] = useState('available');
  const active = usePlayerStore((state) => state.missions);
  const refreshMissions = usePlayerStore((state) => state.refreshMissions);
  const refreshPlayer = usePlayerStore((state) => state.refreshPlayer);
  const toast = useGameStore((state) => state.toast);
  const { run, busy } = useAction();

  const { data, loading, error, refresh } = usePanelData(
    () => api.get<{ board: MissionOfferDto[]; active: ActiveMissionDto[] }>('/api/missions'),
    [],
  );

  const accept = (missionId: string) =>
    void run(
      async () => {
        await api.post('/api/missions/accept', { missionId });
        await Promise.all([refresh(), refreshMissions()]);
      },
      { success: 'Contract accepted' },
    );

  const abandon = (playerMissionId: string) =>
    void run(
      async () => {
        await api.post('/api/missions/abandon', { playerMissionId });
        await Promise.all([refresh(), refreshMissions()]);
      },
      { success: 'Contract abandoned' },
    );

  const claim = (playerMissionId: string) =>
    void run(async () => {
      const result = await api.post<{
        reward: {
          credits: number;
          xp: number;
          levelsGained: number;
          newLevel: number;
          rareDrop: { id: string } | null;
        };
      }>('/api/missions/claim', { playerMissionId });

      playSuccess();
      toast({
        kind: 'reward',
        title: `+${formatCredits(result.reward.credits)} credits, +${result.reward.xp} XP`,
        ...(result.reward.rareDrop ? { detail: `Rare component recovered: ${result.reward.rareDrop.id}` } : {}),
        ttl: 7000,
      });
      if (result.reward.levelsGained > 0) {
        playLevelUp();
        toast({ kind: 'reward', title: `Level ${result.reward.newLevel} reached`, ttl: 8000 });
      }
      await Promise.all([refresh(), refreshMissions(), refreshPlayer()]);
    });

  if (loading && !data) return <p className="py-8 text-center text-xs text-slate-500">Loading contracts…</p>;
  if (error) return <p className="py-8 text-center text-xs text-rose-400">{error}</p>;

  const board = data?.board ?? [];
  const availableCount = board.filter((entry) => entry.available).length;

  return (
    <div>
      <Tabs
        items={[
          { id: 'available', label: 'Available', badge: availableCount },
          { id: 'active', label: 'Active', badge: active.length },
        ]}
        active={tab}
        onChange={setTab}
        className="mb-4"
      />

      {tab === 'available' && (
        <ul className="space-y-2">
          {board.map((entry) => (
            <MissionRow
              key={entry.mission.id}
              offer={entry}
              busy={busy}
              onAccept={() => accept(entry.mission.id)}
            />
          ))}
        </ul>
      )}

      {tab === 'active' && (
        <ul className="space-y-2">
          {active.length === 0 && (
            <li className="py-8 text-center text-xs text-slate-500">
              No contracts running. Take one from the board.
            </li>
          )}
          {active.map((entry) => {
            const mission = MISSIONS_BY_ID.get(entry.missionId);
            if (!mission) return null;
            return (
              <li key={entry.id} className="border border-slate-700/60 bg-slate-900/40 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm text-slate-100">
                      <span className="font-mono text-[11px] text-slate-500">
                        #{String(mission.code).padStart(3, '0')}
                      </span>{' '}
                      {mission.title}
                    </p>
                    <p className="mt-0.5 text-[11px] text-slate-500">
                      {entry.complete
                        ? 'Objectives complete — return to claim.'
                        : `Expires in ${formatDuration(entry.secondsRemaining)}`}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    {entry.complete ? (
                      <Button variant="success" size="sm" loading={busy} onClick={() => claim(entry.id)}>
                        Claim
                      </Button>
                    ) : (
                      <Button variant="ghost" size="sm" loading={busy} onClick={() => abandon(entry.id)}>
                        Abandon
                      </Button>
                    )}
                  </div>
                </div>

                <ul className="mt-2 space-y-1">
                  {mission.objectives.map((objective, index) => {
                    const done = entry.progress[index] ?? 0;
                    const target = entry.targets[index] ?? 1;
                    const complete = done >= target;
                    return (
                      <li key={index} className="flex items-center gap-2 text-[11px]">
                        <span className={complete ? 'text-emerald-400' : 'text-slate-600'}>
                          {complete ? '✓' : '○'}
                        </span>
                        <span className={complete ? 'text-slate-400 line-through' : 'text-slate-300'}>
                          {describeObjective(objective)}
                        </span>
                        <span className="ml-auto font-mono text-slate-500">
                          {done}/{target}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function MissionRow({
  offer,
  busy,
  onAccept,
}: {
  offer: MissionOfferDto;
  busy: boolean;
  onAccept: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const mission: MissionDef = offer.mission;
  const faction = FACTIONS[mission.faction];

  return (
    <li
      className={`border bg-slate-900/40 transition-colors ${
        offer.available ? 'border-slate-700/60' : 'border-slate-800/60 opacity-60'
      }`}
    >
      <div className="flex items-start gap-3 p-3">
        <span aria-hidden className="mt-0.5 text-lg" style={{ color: faction.color }}>
          {MISSION_TYPE_ICON[mission.type]}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="font-mono text-[11px] text-slate-500">
              #{String(mission.code).padStart(3, '0')}
            </span>
            <span className="text-sm text-slate-100">{mission.title}</span>
            <Badge color={faction.color}>{MISSION_TYPE_LABEL[mission.type]}</Badge>
            <span className="font-mono text-[11px] text-amber-400">{stars(mission.difficulty)}</span>
          </div>
          <p className="mt-1 text-[11px] text-slate-400">{mission.summary}</p>

          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500">
            <span>
              <span className="text-slate-600">Reward </span>
              <span className="text-amber-300">{formatCredits(mission.reward.credits)}c</span>
            </span>
            <span>
              <span className="text-slate-600">XP </span>
              <span className="text-sky-300">{mission.reward.xp}</span>
            </span>
            <span>
              <span className="text-slate-600">Rep </span>
              <span style={{ color: faction.color }}>+{mission.reward.reputation.amount}</span>
            </span>
            <span>
              <span className="text-slate-600">Limit </span>
              {formatDuration(mission.durationSec)}
            </span>
            {mission.reward.rareChance ? (
              <span className="text-violet-300">
                {Math.round(mission.reward.rareChance * 100)}% rare drop
              </span>
            ) : null}
          </div>

          {expanded && (
            <div className="mt-3 border-t border-slate-800 pt-2">
              <p className="text-[11px] leading-relaxed text-slate-400">{mission.briefing}</p>
              <ul className="mt-2 space-y-0.5">
                {mission.objectives.map((objective, index) => (
                  <li key={index} className="text-[11px] text-slate-300">
                    · {describeObjective(objective)}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {!offer.available && offer.reason && (
            <p className="mt-2 text-[11px] text-rose-400/80">
              {offer.reason}
              {offer.cooldownRemainingSec > 0 &&
                ` — available in ${formatDuration(offer.cooldownRemainingSec)}`}
            </p>
          )}
        </div>

        <div className="flex shrink-0 flex-col gap-1.5">
          <Button size="sm" variant="ghost" onClick={() => setExpanded((value) => !value)}>
            {expanded ? 'Less' : 'Brief'}
          </Button>
          <Button
            size="sm"
            variant="primary"
            disabled={!offer.available || busy}
            loading={busy}
            onClick={onAccept}
          >
            Accept
          </Button>
        </div>
      </div>
    </li>
  );
}
