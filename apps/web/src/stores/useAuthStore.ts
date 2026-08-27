'use client';

import { create } from 'zustand';
import { api, isAuthError, setSessionToken } from '@/lib/api';
import type { PlayerDto, SessionDto } from '@nova/shared';

export type AuthStatus = 'unknown' | 'signed_out' | 'signing_in' | 'signed_in' | 'error';

interface AuthState {
  status: AuthStatus;
  session: SessionDto | null;
  error: string | null;
  setStatus: (status: AuthStatus) => void;
  setSession: (session: SessionDto | null) => void;
  setError: (error: string | null) => void;
  /** Checks for an existing session without prompting the wallet. */
  restore: () => Promise<PlayerDto | null>;
  signOut: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  status: 'unknown',
  session: null,
  error: null,
  setStatus: (status) => set({ status }),
  setSession: (session) => set({ session }),
  setError: (error) => set({ error }),

  async restore() {
    try {
      const result = await api.get<{ session: SessionDto | null; player: PlayerDto | null }>(
        '/api/auth/session',
      );
      if (!result.session || !result.player) {
        set({ status: 'signed_out', session: null, error: null });
        return null;
      }
      set({ status: 'signed_in', session: result.session, error: null });
      return result.player;
    } catch (error) {
      if (isAuthError(error)) {
        set({ status: 'signed_out', session: null });
        return null;
      }
      set({
        status: 'error',
        error: error instanceof Error ? error.message : 'Cannot reach the station server.',
      });
      return null;
    }
  },

  async signOut() {
    try {
      await api.post('/api/auth/logout', {});
    } catch {
      // A failed logout still ends the local session; the cookie expires anyway.
    }
    setSessionToken(null);
    set({ status: 'signed_out', session: null, error: null });
  },
}));
