'use client';

import { useEffect, useRef, useState } from 'react';
import { addTouchLook, applyTouchAxes, clearTouchAxes } from '@/game/systems/input';
import { useGameStore } from '@/stores/useGameStore';

/**
 * Touch controls.
 *
 * A left-hand stick for movement, a right-hand drag zone for looking, and the
 * two buttons that matter. Shown only on devices with a coarse pointer, so a
 * desktop never sees them.
 */
export function TouchControls() {
  const [touch, setTouch] = useState(false);
  const nearby = useGameStore((state) => state.nearby);
  const setChatOpen = useGameStore((state) => state.setChatOpen);

  useEffect(() => {
    setTouch(window.matchMedia('(pointer: coarse)').matches);
  }, []);

  if (!touch) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-20 sm:hidden">
      <Joystick />
      <LookZone />

      <div className="pointer-events-auto absolute bottom-28 right-4 flex flex-col gap-2">
        <button
          type="button"
          aria-label="Interact"
          disabled={!nearby}
          onClick={() =>
            window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE', bubbles: true }))
          }
          className={`h-16 w-16 rounded-full border text-xs uppercase tracking-[0.12em] backdrop-blur-md ${
            nearby
              ? 'border-sky-400/70 bg-sky-500/20 text-sky-100'
              : 'border-slate-700/60 bg-slate-950/60 text-slate-600'
          }`}
        >
          E
        </button>
        <button
          type="button"
          aria-label="Jump"
          onTouchStart={() =>
            window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true }))
          }
          onTouchEnd={() =>
            window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space', bubbles: true }))
          }
          className="h-14 w-14 rounded-full border border-slate-600/70 bg-slate-950/70 text-[10px] uppercase tracking-[0.12em] text-slate-300 backdrop-blur-md"
        >
          Jump
        </button>
        <button
          type="button"
          aria-label="Open chat"
          onClick={() => setChatOpen(true)}
          className="h-12 w-12 rounded-full border border-slate-600/70 bg-slate-950/70 text-sm text-slate-300 backdrop-blur-md"
        >
          💬
        </button>
      </div>
    </div>
  );
}

function Joystick() {
  const base = useRef<HTMLDivElement>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const active = useRef(false);

  const update = (clientX: number, clientY: number) => {
    const element = base.current;
    if (!element) return;
    const rect = element.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const radius = rect.width / 2;

    let dx = (clientX - cx) / radius;
    let dy = (clientY - cy) / radius;
    const length = Math.hypot(dx, dy);
    if (length > 1) {
      dx /= length;
      dy /= length;
    }
    setKnob({ x: dx, y: dy });
    applyTouchAxes(dx, dy, length > 0.8);
  };

  return (
    <div
      ref={base}
      className="pointer-events-auto absolute bottom-28 left-4 h-32 w-32 rounded-full border border-slate-600/50 bg-slate-950/50 backdrop-blur-sm"
      onTouchStart={(event) => {
        active.current = true;
        const point = event.touches[0];
        if (point) update(point.clientX, point.clientY);
      }}
      onTouchMove={(event) => {
        if (!active.current) return;
        const point = event.touches[0];
        if (point) update(point.clientX, point.clientY);
      }}
      onTouchEnd={() => {
        active.current = false;
        setKnob({ x: 0, y: 0 });
        clearTouchAxes();
      }}
    >
      <div
        aria-hidden
        className="absolute left-1/2 top-1/2 h-12 w-12 -translate-x-1/2 -translate-y-1/2 rounded-full border border-sky-400/60 bg-sky-500/20"
        style={{ transform: `translate(calc(-50% + ${knob.x * 34}px), calc(-50% + ${knob.y * 34}px))` }}
      />
    </div>
  );
}

function LookZone() {
  const last = useRef<{ x: number; y: number } | null>(null);

  return (
    <div
      className="pointer-events-auto absolute inset-y-0 right-0 w-1/2"
      onTouchStart={(event) => {
        const point = event.touches[0];
        if (point) last.current = { x: point.clientX, y: point.clientY };
      }}
      onTouchMove={(event) => {
        const point = event.touches[0];
        if (!point || !last.current) return;
        addTouchLook(point.clientX - last.current.x, point.clientY - last.current.y);
        last.current = { x: point.clientX, y: point.clientY };
      }}
      onTouchEnd={() => {
        last.current = null;
      }}
    />
  );
}
