'use client';

import { create } from 'zustand';
import { MINING_MINIGAME, type ResourceId } from '@nova/game-data';
import type { ExtractResultDto } from '@nova/shared';

/**
 * The mining minigame.
 *
 * A resonance band drifts along a frequency axis; the player slews their beam
 * to stay inside it. Every tick spent inside the band counts, and that count is
 * the only thing sent to the server — where it is clamped to what the elapsed
 * time allows and converted into a bounded multiplier.
 *
 * The simulation runs here, at a fixed tick rate, independent of frame rate:
 * a 144Hz display must not earn more ticks than a 60Hz one.
 */
export interface MiningTarget {
  readonly index: number;
  readonly resource: ResourceId;
  readonly distance: number;
}

export interface MiningSession {
  readonly nodeIndex: number;
  readonly resource: ResourceId;
  readonly startedAt: number;
  /** 0..1 position of the drifting resonance band. */
  band: number;
  /** 0..1 position of the player's beam. */
  beam: number;
  ticks: number;
  holdTicks: number;
  /** Set while the beam is inside the band, for the HUD's feedback. */
  locked: boolean;
}

interface MiningState {
  target: MiningTarget | null;
  session: MiningSession | null;
  lastResult: ExtractResultDto | null;
  submitting: boolean;
  /** Beam slew input, -1..1, written by the minigame's key handler. */
  slew: number;

  setTarget: (target: MiningTarget | null) => void;
  begin: (nodeIndex: number, resource: ResourceId) => void;
  setSlew: (slew: number) => void;
  /** Advances the simulation by one fixed tick. Returns true when it finishes. */
  tick: () => boolean;
  end: () => number;
  setResult: (result: ExtractResultDto | null) => void;
  setSubmitting: (submitting: boolean) => void;
  reset: () => void;
}

const TICK_SECONDS = 1 / MINING_MINIGAME.tickHz;
const TOTAL_TICKS = Math.round(MINING_MINIGAME.extractSec * MINING_MINIGAME.tickHz);

export const useMiningStore = create<MiningState>((set, get) => ({
  target: null,
  session: null,
  lastResult: null,
  submitting: false,
  slew: 0,

  setTarget: (target) => set({ target }),

  begin: (nodeIndex, resource) =>
    set({
      session: {
        nodeIndex,
        resource,
        startedAt: Date.now(),
        band: 0.5,
        beam: 0.5,
        ticks: 0,
        holdTicks: 0,
        locked: false,
      },
      lastResult: null,
      slew: 0,
    }),

  setSlew: (slew) => set({ slew: Math.max(-1, Math.min(1, slew)) }),

  tick: () => {
    const session = get().session;
    if (!session) return false;

    const elapsed = session.ticks * TICK_SECONDS;
    // The band drifts on two out-of-phase sines, so its path never repeats in
    // a way a player can memorise within one extraction.
    const band =
      0.5 +
      Math.sin(elapsed * MINING_MINIGAME.bandSpeed * Math.PI) * 0.3 +
      Math.sin(elapsed * MINING_MINIGAME.bandSpeed * 2.7 + 1.1) * 0.12;
    const clampedBand = Math.max(0.08, Math.min(0.92, band));

    const beam = Math.max(
      0,
      Math.min(1, session.beam + get().slew * MINING_MINIGAME.beamSlew * TICK_SECONDS),
    );
    const locked = Math.abs(beam - clampedBand) <= MINING_MINIGAME.bandHalfWidth;

    const next: MiningSession = {
      ...session,
      band: clampedBand,
      beam,
      ticks: session.ticks + 1,
      holdTicks: session.holdTicks + (locked ? 1 : 0),
      locked,
    };
    set({ session: next });
    return next.ticks >= TOTAL_TICKS;
  },

  end: () => {
    const session = get().session;
    set({ session: null, slew: 0 });
    return session?.holdTicks ?? 0;
  },

  setResult: (lastResult) => set({ lastResult }),
  setSubmitting: (submitting) => set({ submitting }),
  reset: () => set({ target: null, session: null, lastResult: null, slew: 0, submitting: false }),
}));

export const MINIGAME_TOTAL_TICKS = TOTAL_TICKS;
export const MINIGAME_TICK_MS = TICK_SECONDS * 1000;
