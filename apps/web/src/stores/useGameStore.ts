'use client';

import { create } from 'zustand';
import type { StationAreaId } from '@nova/game-data';
import type { Emote, PlayerIdentity } from '@nova/shared';

export type GamePhase =
  | 'idle'
  | 'connecting'
  | 'loading'
  | 'station'
  | 'travelling'
  | 'field'
  | 'returning';

export type PanelId =
  | null
  | 'missions'
  | 'inventory'
  | 'hangar'
  | 'market'
  | 'lab'
  | 'map'
  | 'menu'
  | 'avatar'
  | 'social'
  | 'profile'
  | 'launch'
  | 'refinery'
  | 'broker'
  | 'leaderboard'
  | 'assets';

export interface Toast {
  readonly id: number;
  readonly kind: 'info' | 'success' | 'warn' | 'error' | 'reward';
  readonly title: string;
  readonly detail?: string;
  readonly ttl: number;
  readonly at: number;
}

export interface ChatLine {
  readonly id: string;
  readonly name: string;
  readonly address: string;
  readonly channel: string;
  readonly text: string;
  readonly at: number;
}

interface GameState {
  phase: GamePhase;
  panel: PanelId;
  area: StationAreaId;
  /** The interactable the player is standing next to, if any. */
  nearby: { id: string; label: string; prompt: string } | null;
  /** True while the pointer is locked and WASD drives the character. */
  pointerLocked: boolean;
  chatOpen: boolean;
  toasts: Toast[];
  chat: ChatLine[];
  remotePlayers: Map<string, PlayerIdentity>;
  onlineCount: number;
  areaCounts: Record<string, number>;
  emoteWheelOpen: boolean;
  loadProgress: { label: string; value: number }[];

  setPhase: (phase: GamePhase) => void;
  openPanel: (panel: PanelId) => void;
  closePanel: () => void;
  setArea: (area: StationAreaId) => void;
  setNearby: (nearby: GameState['nearby']) => void;
  setPointerLocked: (locked: boolean) => void;
  setChatOpen: (open: boolean) => void;
  toast: (toast: Omit<Toast, 'id' | 'at' | 'ttl'> & { ttl?: number }) => void;
  dismissToast: (id: number) => void;
  pushChat: (line: ChatLine) => void;
  setRemotePlayers: (players: PlayerIdentity[]) => void;
  addRemotePlayer: (player: PlayerIdentity) => void;
  removeRemotePlayer: (id: string) => void;
  setPresence: (count: number, areas: Record<string, number>) => void;
  setEmoteWheel: (open: boolean) => void;
  setLoadProgress: (steps: { label: string; value: number }[]) => void;
  reset: () => void;
}

let toastId = 0;
const MAX_CHAT_LINES = 80;

/**
 * Transient UI and world state.
 *
 * Deliberately separate from `usePlayerStore`: this store changes many times a
 * second (proximity prompts, chat, presence) while player state changes on
 * request. Splitting them keeps a chat line from re-rendering the hangar.
 */
export const useGameStore = create<GameState>((set, get) => ({
  phase: 'idle',
  panel: null,
  area: 'habitat',
  nearby: null,
  pointerLocked: false,
  chatOpen: false,
  toasts: [],
  chat: [],
  remotePlayers: new Map(),
  onlineCount: 0,
  areaCounts: {},
  emoteWheelOpen: false,
  loadProgress: [],

  setPhase: (phase) => set({ phase }),
  openPanel: (panel) => set({ panel, emoteWheelOpen: false }),
  closePanel: () => set({ panel: null }),
  setArea: (area) => {
    if (get().area !== area) set({ area });
  },
  setNearby: (nearby) => {
    const current = get().nearby;
    if (current?.id === nearby?.id) return;
    set({ nearby });
  },
  setPointerLocked: (pointerLocked) => set({ pointerLocked }),
  setChatOpen: (chatOpen) => set({ chatOpen }),

  toast: (toast) =>
    set((state) => ({
      toasts: [
        ...state.toasts.slice(-4),
        { ...toast, ttl: toast.ttl ?? 5000, id: (toastId += 1), at: Date.now() },
      ],
    })),
  dismissToast: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),

  pushChat: (line) =>
    set((state) => ({ chat: [...state.chat, line].slice(-MAX_CHAT_LINES) })),

  setRemotePlayers: (players) =>
    set({ remotePlayers: new Map(players.map((player) => [player.id, player])) }),
  addRemotePlayer: (player) =>
    set((state) => {
      const next = new Map(state.remotePlayers);
      next.set(player.id, player);
      return { remotePlayers: next };
    }),
  removeRemotePlayer: (id) =>
    set((state) => {
      if (!state.remotePlayers.has(id)) return {};
      const next = new Map(state.remotePlayers);
      next.delete(id);
      return { remotePlayers: next };
    }),
  setPresence: (onlineCount, areaCounts) => set({ onlineCount, areaCounts }),
  setEmoteWheel: (emoteWheelOpen) => set({ emoteWheelOpen }),
  setLoadProgress: (loadProgress) => set({ loadProgress }),

  reset: () =>
    set({
      phase: 'idle',
      panel: null,
      nearby: null,
      toasts: [],
      chat: [],
      remotePlayers: new Map(),
      onlineCount: 0,
      areaCounts: {},
    }),
}));

export const EMOTE_LIST: readonly Emote[] = ['wave', 'salute', 'cheer', 'point', 'sit', 'dance'];
