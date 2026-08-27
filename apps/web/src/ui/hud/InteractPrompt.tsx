'use client';

import { useGameStore } from '@/stores/useGameStore';

/** The "[E] Interact" prompt, shown only when something is actually in range. */
export function InteractPrompt() {
  const nearby = useGameStore((state) => state.nearby);
  const panel = useGameStore((state) => state.panel);
  if (!nearby || panel) return null;

  return (
    <div className="absolute bottom-40 left-1/2 -translate-x-1/2">
      <div className="flex items-center gap-2.5 border border-sky-500/50 bg-slate-950/85 px-4 py-2 backdrop-blur-md">
        <kbd className="flex h-6 w-6 items-center justify-center border border-sky-400/70 bg-sky-500/15 font-mono text-[11px] text-sky-200">
          E
        </kbd>
        <span className="text-xs uppercase tracking-[0.16em] text-slate-200">{nearby.prompt}</span>
        <span className="text-[11px] text-slate-500">{nearby.label}</span>
      </div>
    </div>
  );
}
