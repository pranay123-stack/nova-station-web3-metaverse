'use client';

import { useSettingsStore } from '@/stores/useSettingsStore';

/**
 * Audio.
 *
 * Every sound in NOVA STATION is synthesised at runtime from oscillators and
 * shaped noise. There are no audio files: nothing to license, nothing to
 * download, and the whole soundscape costs a few kilobytes of code. It also
 * means a footstep can be varied per step instead of cycling four samples.
 *
 * The context is created lazily on the first user gesture, because browsers
 * refuse to start one before that and a suspended context silently swallows
 * everything played through it.
 */
let context: AudioContext | null = null;
let masterGain: GainNode | null = null;
let musicGain: GainNode | null = null;
let sfxGain: GainNode | null = null;
let ambientSource: { stop: () => void } | null = null;

export function audioReady(): boolean {
  return context !== null && context.state === 'running';
}

export function initAudio(): void {
  if (context) {
    if (context.state === 'suspended') void context.resume();
    return;
  }
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return;

  context = new Ctor();
  masterGain = context.createGain();
  musicGain = context.createGain();
  sfxGain = context.createGain();

  musicGain.connect(masterGain);
  sfxGain.connect(masterGain);
  masterGain.connect(context.destination);

  applyVolumes();
  useSettingsStore.subscribe(applyVolumes);
}

export function applyVolumes(): void {
  if (!context || !masterGain || !musicGain || !sfxGain) return;
  const settings = useSettingsStore.getState();
  const master = settings.muted ? 0 : settings.masterVolume;
  masterGain.gain.setTargetAtTime(master, context.currentTime, 0.05);
  musicGain.gain.setTargetAtTime(settings.musicVolume, context.currentTime, 0.05);
  sfxGain.gain.setTargetAtTime(settings.sfxVolume, context.currentTime, 0.05);
}

export function suspendAudio(): void {
  void context?.suspend();
}

export function resumeAudio(): void {
  void context?.resume();
}

/* -------------------------------------------------------------- helpers */

function noiseBuffer(seconds: number): AudioBuffer | null {
  if (!context) return null;
  const length = Math.floor(context.sampleRate * seconds);
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) {
    data[i] = Math.random() * 2 - 1;
  }
  return buffer;
}

interface ToneOptions {
  readonly frequency: number;
  readonly type?: OscillatorType;
  readonly duration?: number;
  readonly gain?: number;
  readonly sweepTo?: number;
  readonly bus?: 'sfx' | 'music';
}

function tone(options: ToneOptions): void {
  if (!context || !sfxGain || !musicGain) return;
  const { frequency, type = 'sine', duration = 0.16, gain = 0.2, sweepTo, bus = 'sfx' } = options;
  const now = context.currentTime;

  const oscillator = context.createOscillator();
  const envelope = context.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, now);
  if (sweepTo !== undefined) {
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, sweepTo), now + duration);
  }

  envelope.gain.setValueAtTime(0.0001, now);
  envelope.gain.exponentialRampToValueAtTime(gain, now + 0.008);
  envelope.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  oscillator.connect(envelope);
  envelope.connect(bus === 'music' ? musicGain : sfxGain);
  oscillator.start(now);
  oscillator.stop(now + duration + 0.02);
}

function noiseBurst(duration: number, gain: number, filterHz: number, q = 1): void {
  if (!context || !sfxGain) return;
  const buffer = noiseBuffer(duration);
  if (!buffer) return;
  const now = context.currentTime;

  const source = context.createBufferSource();
  source.buffer = buffer;

  const filter = context.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = filterHz;
  filter.Q.value = q;

  const envelope = context.createGain();
  envelope.gain.setValueAtTime(gain, now);
  envelope.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  source.connect(filter);
  filter.connect(envelope);
  envelope.connect(sfxGain);
  source.start(now);
  source.stop(now + duration);
}

/* ------------------------------------------------------------ the sounds */

/** A soft, slightly varied step. Landing is heavier and lower. */
export function playFootstep(landing = false): void {
  if (!audioReady()) return;
  const pitch = 220 + Math.random() * 90;
  noiseBurst(landing ? 0.16 : 0.07, landing ? 0.16 : 0.06, landing ? pitch * 0.6 : pitch, 1.4);
}

export function playUiClick(): void {
  if (!audioReady()) return;
  tone({ frequency: 660, type: 'square', duration: 0.05, gain: 0.05 });
}

export function playUiOpen(): void {
  if (!audioReady()) return;
  tone({ frequency: 320, type: 'triangle', duration: 0.14, gain: 0.09, sweepTo: 660 });
}

export function playUiClose(): void {
  if (!audioReady()) return;
  tone({ frequency: 520, type: 'triangle', duration: 0.12, gain: 0.07, sweepTo: 240 });
}

export function playInteract(): void {
  if (!audioReady()) return;
  tone({ frequency: 480, type: 'sine', duration: 0.1, gain: 0.1, sweepTo: 780 });
}

export function playSuccess(): void {
  if (!audioReady()) return;
  tone({ frequency: 523, type: 'sine', duration: 0.12, gain: 0.11 });
  window.setTimeout(() => tone({ frequency: 784, type: 'sine', duration: 0.18, gain: 0.1 }), 90);
}

export function playError(): void {
  if (!audioReady()) return;
  tone({ frequency: 180, type: 'sawtooth', duration: 0.22, gain: 0.09, sweepTo: 90 });
}

export function playAlert(): void {
  if (!audioReady()) return;
  tone({ frequency: 880, type: 'square', duration: 0.1, gain: 0.08 });
  window.setTimeout(() => tone({ frequency: 880, type: 'square', duration: 0.1, gain: 0.08 }), 160);
}

/** The mining beam: a rising drone while the laser is engaged. */
export function playMiningPulse(intensity: number): void {
  if (!audioReady()) return;
  tone({
    frequency: 140 + intensity * 260,
    type: 'sawtooth',
    duration: 0.12,
    gain: 0.05 + intensity * 0.05,
  });
}

export function playOreCollected(): void {
  if (!audioReady()) return;
  tone({ frequency: 700, type: 'triangle', duration: 0.09, gain: 0.08, sweepTo: 1100 });
}

export function playLaunch(): void {
  if (!audioReady()) return;
  tone({ frequency: 60, type: 'sawtooth', duration: 1.6, gain: 0.14, sweepTo: 220 });
  noiseBurst(1.4, 0.1, 300, 0.6);
}

export function playLevelUp(): void {
  if (!audioReady()) return;
  [523, 659, 784, 1047].forEach((frequency, index) => {
    window.setTimeout(() => tone({ frequency, type: 'sine', duration: 0.22, gain: 0.1 }), index * 110);
  });
}

/**
 * Station ambience: a low hum with a slow filter sweep, plus intermittent
 * machinery. Built from two oscillators rather than a loop so it never
 * develops an audible seam.
 */
export function startAmbient(): void {
  if (!context || !musicGain || ambientSource) return;
  const now = context.currentTime;

  const drone = context.createOscillator();
  drone.type = 'sine';
  drone.frequency.value = 55;

  const harmonic = context.createOscillator();
  harmonic.type = 'triangle';
  harmonic.frequency.value = 82.5;

  const filter = context.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 320;
  filter.Q.value = 0.7;

  const lfo = context.createOscillator();
  lfo.type = 'sine';
  lfo.frequency.value = 0.06;
  const lfoGain = context.createGain();
  lfoGain.gain.value = 140;
  lfo.connect(lfoGain);
  lfoGain.connect(filter.frequency);

  const level = context.createGain();
  level.gain.setValueAtTime(0.0001, now);
  level.gain.exponentialRampToValueAtTime(0.16, now + 3);

  drone.connect(filter);
  harmonic.connect(filter);
  filter.connect(level);
  level.connect(musicGain);

  drone.start(now);
  harmonic.start(now);
  lfo.start(now);

  // Occasional distant machinery keeps the ambience from feeling static.
  const machinery = window.setInterval(() => {
    if (!audioReady()) return;
    noiseBurst(0.5 + Math.random() * 0.6, 0.02, 200 + Math.random() * 500, 2.5);
  }, 7000);

  ambientSource = {
    stop() {
      window.clearInterval(machinery);
      const stopAt = context ? context.currentTime + 0.4 : 0;
      level.gain.exponentialRampToValueAtTime(0.0001, stopAt);
      drone.stop(stopAt + 0.1);
      harmonic.stop(stopAt + 0.1);
      lfo.stop(stopAt + 0.1);
      ambientSource = null;
    },
  };
}

export function stopAmbient(): void {
  ambientSource?.stop();
}
