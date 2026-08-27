'use client';

import { create } from 'zustand';

export type ConnectionState = 'offline' | 'connecting' | 'online' | 'reconnecting' | 'failed';

interface NetState {
  connection: ConnectionState;
  latencyMs: number;
  /** Number of consecutive reconnection attempts. */
  attempts: number;
  lastError: string | null;
  /** Set when the server corrected the local position. */
  corrections: number;
  setConnection: (connection: ConnectionState) => void;
  setLatency: (latencyMs: number) => void;
  setAttempts: (attempts: number) => void;
  setError: (lastError: string | null) => void;
  bumpCorrections: () => void;
}

export const useNetStore = create<NetState>((set) => ({
  connection: 'offline',
  latencyMs: 0,
  attempts: 0,
  lastError: null,
  corrections: 0,
  setConnection: (connection) => set({ connection }),
  setLatency: (latencyMs) => set({ latencyMs }),
  setAttempts: (attempts) => set({ attempts }),
  setError: (lastError) => set({ lastError }),
  bumpCorrections: () => set((state) => ({ corrections: state.corrections + 1 })),
}));
