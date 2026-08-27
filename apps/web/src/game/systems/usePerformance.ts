'use client';

import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useSettingsStore, type QualityLevel } from '@/stores/useSettingsStore';

/**
 * Frame-rate watchdog.
 *
 * Rather than guessing hardware from a user-agent string, the game measures the
 * frame rate it is actually achieving and steps quality down when it cannot
 * hold the target. It steps down once per level and never steps back up on its
 * own — oscillating between quality levels is worse than sitting at the lower
 * one.
 */
const TARGET_FPS = 55;
const SAMPLE_SECONDS = 4;
const GRACE_SECONDS = 3;

const NEXT_LEVEL: Record<QualityLevel, QualityLevel | null> = {
  high: 'medium',
  medium: 'low',
  low: null,
};

export interface FpsSample {
  fps: number;
  frames: number;
}

/** Live FPS, readable by the HUD without re-rendering the scene. */
export const fpsSample: FpsSample = { fps: 0, frames: 0 };

export function usePerformanceGovernor(): void {
  const gl = useThree((three) => three.gl);
  const frames = useRef(0);
  const elapsed = useRef(0);
  const startup = useRef(0);
  const consecutiveSlow = useRef(0);

  useEffect(() => {
    // Cap the device pixel ratio: a 3x display renders nine times the pixels of
    // a 1x one, and the difference is invisible at this art style.
    const quality = useSettingsStore.getState().quality;
    const cap = quality === 'high' ? 2 : quality === 'medium' ? 1.5 : 1;
    gl.setPixelRatio(Math.min(window.devicePixelRatio, cap));
  }, [gl]);

  useFrame((_, delta) => {
    frames.current += 1;
    elapsed.current += delta;
    startup.current += delta;

    if (elapsed.current < 1) return;

    fpsSample.fps = Math.round(frames.current / elapsed.current);
    fpsSample.frames += frames.current;
    frames.current = 0;
    elapsed.current = 0;

    // Ignore the first seconds: shader compilation makes them unrepresentative.
    if (startup.current < GRACE_SECONDS) return;

    const settings = useSettingsStore.getState();
    if (fpsSample.fps >= TARGET_FPS) {
      consecutiveSlow.current = 0;
      return;
    }

    consecutiveSlow.current += 1;
    if (consecutiveSlow.current < SAMPLE_SECONDS) return;
    consecutiveSlow.current = 0;

    const next = NEXT_LEVEL[settings.quality];
    if (!next) return;

    settings.applyAutoQuality(next);
    const cap = next === 'medium' ? 1.5 : 1;
    gl.setPixelRatio(Math.min(window.devicePixelRatio, cap));
  });
}
