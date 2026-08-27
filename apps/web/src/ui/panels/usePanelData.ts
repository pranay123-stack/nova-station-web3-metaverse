'use client';

import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '@/lib/api';
import { useGameStore } from '@/stores/useGameStore';
import { playError } from '@/game/audio/engine';

/**
 * Loads panel data on open and surfaces failures as toasts rather than as a
 * blank panel. Every panel uses this, so a server error looks the same
 * everywhere and no panel silently shows stale numbers.
 */
export function usePanelData<T>(load: () => Promise<T>, deps: readonly unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await load());
    } catch (caught) {
      const message =
        caught instanceof ApiError ? caught.message : 'Could not reach the station server.';
      setError(message);
    } finally {
      setLoading(false);
    }
     
  }, deps);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { data, loading, error, refresh };
}

/** Runs an action, reporting the outcome through the toast system. */
export function useAction() {
  const toast = useGameStore((state) => state.toast);
  const [busy, setBusy] = useState(false);

  const run = useCallback(
    async <T>(
      action: () => Promise<T>,
      options: { success?: string; detail?: string } = {},
    ): Promise<T | null> => {
      setBusy(true);
      try {
        const result = await action();
        if (options.success) {
          toast({ kind: 'success', title: options.success, ...(options.detail ? { detail: options.detail } : {}) });
        }
        return result;
      } catch (error) {
        playError();
        toast({
          kind: 'error',
          title: error instanceof ApiError ? error.message : 'That action failed.',
        });
        return null;
      } finally {
        setBusy(false);
      }
    },
    [toast],
  );

  return { run, busy };
}
