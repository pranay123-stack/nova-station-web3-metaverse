import type { ReactNode } from 'react';
import { cn } from './cn.js';

export interface TabItem {
  readonly id: string;
  readonly label: ReactNode;
  readonly badge?: ReactNode;
}

export interface TabsProps {
  readonly items: readonly TabItem[];
  readonly active: string;
  readonly onChange: (id: string) => void;
  readonly className?: string;
}

/** Roving-focus tab strip: arrow keys move between tabs, as ARIA expects. */
export function Tabs({ items, active, onChange, className }: TabsProps) {
  const move = (delta: number) => {
    const index = items.findIndex((item) => item.id === active);
    const next = items[(index + delta + items.length) % items.length];
    if (next) onChange(next.id);
  };

  return (
    <div
      role="tablist"
      className={cn('flex gap-0.5 border-b border-slate-800/80', className)}
      onKeyDown={(event) => {
        if (event.key === 'ArrowRight') {
          event.preventDefault();
          move(1);
        }
        if (event.key === 'ArrowLeft') {
          event.preventDefault();
          move(-1);
        }
      }}
    >
      {items.map((item) => {
        const selected = item.id === active;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(item.id)}
            className={cn(
              'relative flex items-center gap-1.5 px-3 py-2 text-[11px] uppercase tracking-[0.16em] transition-colors',
              'outline-none focus-visible:ring-1 focus-visible:ring-sky-400',
              selected ? 'text-sky-200' : 'text-slate-500 hover:text-slate-300',
            )}
          >
            {item.label}
            {item.badge != null && (
              <span className="rounded-sm bg-slate-800 px-1 text-[9px] tabular-nums text-slate-300">
                {item.badge}
              </span>
            )}
            {selected && (
              <span
                aria-hidden
                className="absolute inset-x-0 -bottom-px h-px bg-sky-400 shadow-[0_0_8px_rgba(56,189,248,0.9)]"
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
