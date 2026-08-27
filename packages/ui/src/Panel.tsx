import type { ReactNode } from 'react';
import { cn } from './cn.js';

export interface PanelProps {
  readonly title?: ReactNode;
  readonly subtitle?: ReactNode;
  readonly actions?: ReactNode;
  readonly children: ReactNode;
  readonly className?: string;
  readonly bodyClassName?: string;
  readonly accent?: string;
}

/**
 * The base container for every HUD surface.
 *
 * The clipped top-right corner and the accent rule are the whole visual
 * signature of the interface — defining them once means every panel in the game
 * reads as part of the same machine.
 */
export function Panel({
  title,
  subtitle,
  actions,
  children,
  className,
  bodyClassName,
  accent = '#38bdf8',
}: PanelProps) {
  return (
    <section
      className={cn(
        'relative border border-slate-700/60 bg-slate-950/85 backdrop-blur-md',
        '[clip-path:polygon(0_0,calc(100%-14px)_0,100%_14px,100%_100%,0_100%)]',
        className,
      )}
    >
      <span
        aria-hidden
        className="absolute inset-x-0 top-0 h-px opacity-70"
        style={{ background: `linear-gradient(90deg, ${accent}, transparent 65%)` }}
      />
      {(title || actions) && (
        <header className="flex items-start justify-between gap-3 border-b border-slate-800/80 px-4 py-2.5">
          <div className="min-w-0">
            {title && (
              <h2 className="truncate text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-200">
                {title}
              </h2>
            )}
            {subtitle && <p className="mt-0.5 text-[11px] text-slate-500">{subtitle}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
        </header>
      )}
      <div className={cn('px-4 py-3', bodyClassName)}>{children}</div>
    </section>
  );
}
