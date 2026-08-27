import { cn } from './cn.js';

export interface MeterProps {
  readonly value: number;
  readonly max: number;
  readonly label?: string;
  readonly color?: string;
  readonly showValue?: boolean;
  readonly className?: string;
  readonly height?: 'thin' | 'normal' | 'thick';
  /** Segmented bars read as a game gauge rather than a web progress bar. */
  readonly segments?: number;
}

const HEIGHTS = { thin: 'h-1', normal: 'h-2', thick: 'h-3' } as const;

export function Meter({
  value,
  max,
  label,
  color = '#38bdf8',
  showValue = false,
  className,
  height = 'normal',
  segments = 0,
}: MeterProps) {
  const safeMax = max > 0 ? max : 1;
  const fraction = Math.max(0, Math.min(1, value / safeMax));

  return (
    <div className={cn('w-full', className)}>
      {(label || showValue) && (
        <div className="mb-1 flex items-baseline justify-between gap-2">
          {label && (
            <span className="text-[10px] uppercase tracking-[0.18em] text-slate-400">{label}</span>
          )}
          {showValue && (
            <span className="font-mono text-[10px] tabular-nums text-slate-300">
              {Math.round(value).toLocaleString()} / {Math.round(safeMax).toLocaleString()}
            </span>
          )}
        </div>
      )}
      <div
        role="progressbar"
        aria-valuenow={Math.round(value)}
        aria-valuemin={0}
        aria-valuemax={Math.round(safeMax)}
        aria-label={label}
        className={cn(
          'relative w-full overflow-hidden border border-slate-700/70 bg-slate-900/80',
          HEIGHTS[height],
        )}
      >
        <div
          className="h-full transition-[width] duration-300 ease-out"
          style={{
            width: `${fraction * 100}%`,
            background: `linear-gradient(90deg, ${color}aa, ${color})`,
            boxShadow: `0 0 12px -2px ${color}`,
          }}
        />
        {segments > 0 && (
          <div aria-hidden className="pointer-events-none absolute inset-0 flex">
            {Array.from({ length: segments }, (_, index) => (
              <span
                key={index}
                className="flex-1 border-r border-slate-950/70 last:border-r-0"
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
