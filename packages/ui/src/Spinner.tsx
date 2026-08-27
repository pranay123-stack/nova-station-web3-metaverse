import { cn } from './cn.js';

export function Spinner({ className, label }: { className?: string; label?: string }) {
  return (
    <span role="status" aria-live="polite" className={cn('inline-flex items-center gap-2', className)}>
      <span
        aria-hidden
        className="h-3.5 w-3.5 animate-spin rounded-full border border-sky-400/70 border-t-transparent"
      />
      {label && <span className="text-[11px] uppercase tracking-[0.18em] text-slate-400">{label}</span>}
      {!label && <span className="sr-only">Loading</span>}
    </span>
  );
}
