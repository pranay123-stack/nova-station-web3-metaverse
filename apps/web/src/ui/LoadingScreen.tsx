'use client';

import { useEffect, useState } from 'react';

export interface LoadStep {
  readonly label: string;
  value: number;
}

/**
 * The boot sequence.
 *
 * Each bar tracks a real stage — the world building itself, assets compiling,
 * the socket handshaking — rather than a timer pretending to be progress. The
 * screen fades out when the last one completes, not on a fixed delay.
 */
export function LoadingScreen({ steps, done }: { steps: readonly LoadStep[]; done: boolean }) {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if (!done) return undefined;
    const timer = window.setTimeout(() => setHidden(true), 650);
    return () => window.clearTimeout(timer);
  }, [done]);

  if (hidden) return null;

  return (
    <div
      className={`scanlines fixed inset-0 z-40 flex items-center justify-center bg-[#05070d] transition-opacity duration-500 ${
        done ? 'pointer-events-none opacity-0' : 'opacity-100'
      }`}
      role="status"
      aria-live="polite"
    >
      <div aria-hidden className="grid-backdrop pointer-events-none absolute inset-0 opacity-25" />
      <div className="relative z-10 w-full max-w-sm px-6">
        <p className="text-[10px] uppercase tracking-[0.42em] text-sky-500">Initialising</p>
        <h1 className="mt-1 text-2xl tracking-tight text-slate-100">NOVA STATION</h1>

        <ul className="mt-8 space-y-3">
          {steps.map((step) => (
            <li key={step.label}>
              <div className="mb-1 flex items-baseline justify-between">
                <span className="text-[11px] uppercase tracking-[0.16em] text-slate-400">
                  {step.label}
                </span>
                <span className="font-mono text-[10px] text-slate-600">
                  {step.value >= 100 ? 'OK' : `${Math.round(step.value)}%`}
                </span>
              </div>
              <div className="h-1 w-full bg-slate-900">
                <div
                  className="h-full bg-sky-400 transition-[width] duration-300"
                  style={{
                    width: `${Math.min(100, step.value)}%`,
                    boxShadow: '0 0 10px rgba(56,189,248,0.7)',
                  }}
                />
              </div>
            </li>
          ))}
        </ul>

        <p className="mt-8 font-mono text-[10px] text-slate-700">
          {done ? '> ready' : '> establishing docking clamp…'}
        </p>
      </div>
    </div>
  );
}
