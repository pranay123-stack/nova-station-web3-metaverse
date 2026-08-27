'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type QualityLevel = 'low' | 'medium' | 'high';

export interface SettingsState {
  quality: QualityLevel;
  /** Set when the frame-rate watchdog has stepped quality down on its own. */
  autoQualityApplied: boolean;
  masterVolume: number;
  musicVolume: number;
  sfxVolume: number;
  muted: boolean;
  reducedMotion: boolean;
  showFps: boolean;
  invertY: boolean;
  mouseSensitivity: number;
  cameraDistance: number;
  showNameplates: boolean;
  highContrast: boolean;

  set: <K extends keyof SettingsState>(key: K, value: SettingsState[K]) => void;
  applyAutoQuality: (quality: QualityLevel) => void;
}

/**
 * Player preferences, persisted locally.
 *
 * Quality, audio and motion settings live here rather than in the game store so
 * that reading them never re-renders the 3D tree — the render loop samples them
 * through `getState()` inside `useFrame`.
 */
export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      quality: 'high',
      autoQualityApplied: false,
      masterVolume: 0.7,
      musicVolume: 0.35,
      sfxVolume: 0.75,
      muted: false,
      reducedMotion: false,
      showFps: false,
      invertY: false,
      mouseSensitivity: 1,
      cameraDistance: 7.5,
      showNameplates: true,
      highContrast: false,

      set: (key, value) => set({ [key]: value } as Partial<SettingsState>),
      applyAutoQuality: (quality) => set({ quality, autoQualityApplied: true }),
    }),
    {
      name: 'nova-settings',
      version: 1,
    },
  ),
);

/** Reads the OS-level reduced-motion preference once, at startup. */
export function systemPrefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
