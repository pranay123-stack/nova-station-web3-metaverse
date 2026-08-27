'use client';

import { useGameStore, type PanelId } from '@/stores/useGameStore';
import { playUiOpen } from '@/game/audio/engine';

const ACTIONS: readonly { id: PanelId; label: string; key: string; icon: string }[] = [
  { id: 'missions', label: 'Missions', key: 'J', icon: '◈' },
  { id: 'inventory', label: 'Inventory', key: 'I', icon: '▦' },
  { id: 'map', label: 'Map', key: 'M', icon: '◎' },
  { id: 'social', label: 'Crew', key: 'P', icon: '⚇' },
  { id: 'menu', label: 'Menu', key: 'Esc', icon: '≡' },
];

/** The bottom bar. Keyboard shortcuts are printed on the buttons themselves. */
export function ActionBar() {
  const open = useGameStore((state) => state.openPanel);
  const panel = useGameStore((state) => state.panel);
  const missions = useGameStore((state) => state.chat.length);

  return (
    <nav
      aria-label="Game menus"
      className="pointer-events-auto absolute inset-x-0 bottom-0 flex justify-center pb-3"
    >
      <div className="flex items-stretch gap-px border border-slate-700/60 bg-slate-950/85 backdrop-blur-md">
        {ACTIONS.map((action) => (
          <button
            key={action.label}
            type="button"
            // The visible label sits alongside an icon and a shortcut hint, so
            // the accessible name is set explicitly rather than being read as
            // "◎ Map M".
            aria-label={action.label}
            aria-keyshortcuts={action.key}
            aria-pressed={panel === action.id}
            onClick={() => {
              playUiOpen();
              open(panel === action.id ? null : action.id);
            }}
            className={`group flex min-w-[72px] flex-col items-center gap-0.5 px-4 py-2 transition-colors outline-none focus-visible:ring-1 focus-visible:ring-sky-400 ${
              panel === action.id
                ? 'bg-sky-500/15 text-sky-200'
                : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
            }`}
          >
            <span aria-hidden className="text-base leading-none">
              {action.icon}
            </span>
            <span className="text-[10px] uppercase tracking-[0.16em]">{action.label}</span>
            <span className="font-mono text-[9px] text-slate-600 group-hover:text-slate-500">
              {action.key}
            </span>
          </button>
        ))}
      </div>
      <span className="sr-only">{missions} chat messages received</span>
    </nav>
  );
}
