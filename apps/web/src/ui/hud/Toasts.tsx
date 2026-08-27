'use client';

import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useGameStore, type Toast } from '@/stores/useGameStore';
import { useSettingsStore } from '@/stores/useSettingsStore';

const STYLES: Record<Toast['kind'], string> = {
  info: 'border-slate-600/70 text-slate-200',
  success: 'border-emerald-500/60 text-emerald-200',
  warn: 'border-amber-500/60 text-amber-200',
  error: 'border-rose-500/60 text-rose-200',
  reward: 'border-violet-500/60 text-violet-200',
};

/** Transient notifications: rewards, level-ups, warnings. */
export function Toasts() {
  const toasts = useGameStore((state) => state.toasts);
  const dismiss = useGameStore((state) => state.dismissToast);
  const reducedMotion = useSettingsStore((state) => state.reducedMotion);

  useEffect(() => {
    if (toasts.length === 0) return undefined;
    const timers = toasts.map((toast) =>
      window.setTimeout(() => dismiss(toast.id), Math.max(0, toast.at + toast.ttl - Date.now())),
    );
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [toasts, dismiss]);

  return (
    <div
      className="absolute right-3 top-24 flex w-72 flex-col gap-2 sm:right-4"
      role="status"
      aria-live="polite"
    >
      <AnimatePresence initial={false}>
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            layout={!reducedMotion}
            initial={reducedMotion ? false : { opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={reducedMotion ? { opacity: 0 } : { opacity: 0, x: 24 }}
            transition={{ duration: 0.18 }}
            className={`pointer-events-auto border bg-slate-950/90 px-3 py-2 backdrop-blur-md ${STYLES[toast.kind]}`}
          >
            <p className="text-[11px] font-medium uppercase tracking-[0.14em]">{toast.title}</p>
            {toast.detail && <p className="mt-0.5 text-[11px] text-slate-400">{toast.detail}</p>}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
