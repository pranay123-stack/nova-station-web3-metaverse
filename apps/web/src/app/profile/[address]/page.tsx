'use client';

import Link from 'next/link';
import { use, useEffect, useState } from 'react';
import { FACTIONS, FACTION_IDS, SHIP_CLASS_LABEL } from '@nova/game-data';
import { Badge, Meter, RARITY_TEXT } from '@nova/ui';
import type { PlayerDto } from '@nova/shared';
import { api } from '@/lib/api';
import { formatCredits, formatPlaytime, relativeTime, shortAddress } from '@/lib/format';

interface ProfileResponse {
  readonly player: PlayerDto;
  readonly ships: readonly {
    defId: string;
    name: string;
    shipClass: string;
    rarity: string;
    tokenId: string | null;
  }[];
  readonly achievementsUnlocked: number;
  readonly onChainAssets: number;
}

/** A public commander record, readable by anyone with the address. */
export default function ProfilePage({ params }: { params: Promise<{ address: string }> }) {
  const { address } = use(params);
  const [data, setData] = useState<ProfileResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<ProfileResponse>(`/api/player/profile/${address}`)
      .then(setData)
      .catch(() => setError('No commander is registered at that address.'));
  }, [address]);

  if (error) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#05070d] text-slate-400">
        <div className="text-center">
          <p className="text-sm">{error}</p>
          <Link href="/" className="mt-4 inline-block text-[11px] uppercase tracking-[0.2em] text-sky-400">
            ← Nova Station
          </Link>
        </div>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#05070d] text-slate-500">
        <p className="text-xs">Reading the registry…</p>
      </main>
    );
  }

  const { player } = data;

  return (
    <main className="min-h-screen bg-[#05070d] text-slate-200">
      <div className="mx-auto max-w-4xl px-5 py-10">
        <Link href="/" className="text-[11px] uppercase tracking-[0.2em] text-slate-500 hover:text-sky-300">
          ← Nova Station
        </Link>

        <header className="mt-6 flex flex-wrap items-end justify-between gap-4 border-b border-slate-800 pb-6">
          <div>
            <p className="text-[10px] uppercase tracking-[0.42em] text-sky-500">Commander record</p>
            <h1 className="mt-1 text-3xl tracking-tight text-slate-50">{player.displayName}</h1>
            <p className="mt-1 font-mono text-[11px] text-slate-500">{shortAddress(player.address)}</p>
          </div>
          <div className="text-right">
            <p className="font-mono text-4xl text-sky-300">{player.level}</p>
            <p className="text-[10px] uppercase tracking-[0.2em] text-slate-600">Level</p>
          </div>
        </header>

        <div className="mt-6">
          <Meter value={player.xpIntoLevel} max={player.xpForLevel || 1} label="Progress" color="#38bdf8" showValue />
        </div>

        <section className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: 'Credits', value: formatCredits(player.credits) },
            { label: 'Contracts', value: player.stats.missionsCompleted },
            { label: 'Ore mined', value: formatCredits(player.stats.resourcesMined) },
            { label: 'Expeditions', value: player.stats.expeditions },
            { label: 'Crafted', value: player.stats.itemsCrafted },
            { label: 'Trades', value: player.stats.trades },
            { label: 'Achievements', value: data.achievementsUnlocked },
            { label: 'On-chain assets', value: data.onChainAssets },
          ].map((stat) => (
            <div key={stat.label} className="border border-slate-800/70 bg-slate-900/40 p-3">
              <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">{stat.label}</p>
              <p className="mt-0.5 font-mono text-lg text-slate-200">{stat.value}</p>
            </div>
          ))}
        </section>

        <section className="mt-8">
          <h2 className="text-[10px] uppercase tracking-[0.24em] text-slate-500">Standing</h2>
          <div className="mt-3 space-y-3">
            {FACTION_IDS.map((id) => {
              const faction = FACTIONS[id];
              return (
                <div key={id}>
                  <div className="flex items-baseline justify-between">
                    <span className="text-[13px]" style={{ color: faction.color }}>
                      {faction.name}
                    </span>
                    <span className="text-[11px] text-slate-500">
                      {player.rankNames[id]} · {player.reputation[id].toLocaleString()}
                    </span>
                  </div>
                  <Meter
                    value={player.reputation[id]}
                    max={Math.max(1, faction.rankThresholds[faction.rankThresholds.length - 1] ?? 1)}
                    color={faction.color}
                    height="thin"
                  />
                </div>
              );
            })}
          </div>
        </section>

        <section className="mt-8">
          <h2 className="text-[10px] uppercase tracking-[0.24em] text-slate-500">Fleet</h2>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {data.ships.map((ship, index) => (
              <li
                key={`${ship.defId}-${index}`}
                className="flex items-center justify-between gap-2 border border-slate-800/70 bg-slate-900/40 p-3"
              >
                <div className="min-w-0">
                  <p className={`truncate text-[13px] ${RARITY_TEXT[ship.rarity]}`}>{ship.name}</p>
                  <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">
                    {SHIP_CLASS_LABEL[ship.shipClass as keyof typeof SHIP_CLASS_LABEL] ?? ship.shipClass}
                  </p>
                </div>
                {ship.tokenId && <Badge color="#c084fc">⛓ #{ship.tokenId}</Badge>}
              </li>
            ))}
          </ul>
        </section>

        <footer className="mt-10 border-t border-slate-800 pt-4 text-[11px] text-slate-600">
          Aboard since {relativeTime(player.createdAt)} · {formatPlaytime(player.playtimeSec)} logged
        </footer>
      </div>
    </main>
  );
}
