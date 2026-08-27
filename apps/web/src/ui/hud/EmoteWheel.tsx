'use client';

import { EMOTE_LIST, useGameStore } from '@/stores/useGameStore';
import { gameSocket } from '@/game/net/socket';
import { playUiClick } from '@/game/audio/engine';

const LABELS: Record<string, string> = {
  wave: 'Wave',
  salute: 'Salute',
  cheer: 'Cheer',
  point: 'Point',
  sit: 'Sit',
  dance: 'Dance',
};

/** Hold G to open; click or press the number to play an emote. */
export function EmoteWheel() {
  const open = useGameStore((state) => state.emoteWheelOpen);
  const setOpen = useGameStore((state) => state.setEmoteWheel);
  if (!open) return null;

  const radius = 92;

  return (
    <div className="pointer-events-auto absolute inset-0 flex items-center justify-center">
      <div className="relative h-56 w-56" role="menu" aria-label="Emotes">
        {EMOTE_LIST.map((emote, index) => {
          const angle = (index / EMOTE_LIST.length) * Math.PI * 2 - Math.PI / 2;
          return (
            <button
              key={emote}
              type="button"
              role="menuitem"
              onClick={() => {
                playUiClick();
                gameSocket.sendEmote(emote);
                setOpen(false);
              }}
              style={{
                left: `calc(50% + ${Math.cos(angle) * radius}px)`,
                top: `calc(50% + ${Math.sin(angle) * radius}px)`,
              }}
              className="absolute -translate-x-1/2 -translate-y-1/2 border border-sky-500/50 bg-slate-950/90 px-3 py-1.5 text-[11px] uppercase tracking-[0.14em] text-sky-200 backdrop-blur-md transition-colors hover:bg-sky-500/20"
            >
              {LABELS[emote] ?? emote}
            </button>
          );
        })}
        <p className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-[10px] uppercase tracking-[0.2em] text-slate-500">
          Release G
        </p>
      </div>
    </div>
  );
}
