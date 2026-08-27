'use client';

/**
 * Input state.
 *
 * A mutable singleton rather than React state: the character controller reads
 * this every frame, and routing keystrokes through `useState` would re-render
 * the entire scene on every step.
 *
 * Key handling is by `event.code`, not `event.key`, so the controls land in the
 * same physical places on AZERTY and QWERTY.
 */
export interface InputState {
  forward: number;
  right: number;
  jump: boolean;
  run: boolean;
  /** Accumulated mouse movement since the last frame consumed it. */
  lookX: number;
  lookY: number;
  zoom: number;
  interactPressed: boolean;
  /** True while a text field or panel has focus and should swallow movement. */
  suspended: boolean;
}

export const input: InputState = {
  forward: 0,
  right: 0,
  jump: false,
  run: false,
  lookX: 0,
  lookY: 0,
  zoom: 0,
  interactPressed: false,
  suspended: false,
};

const held = new Set<string>();

/** Reads the movement axes out of the currently held keys. */
function recompute(): void {
  if (input.suspended) {
    input.forward = 0;
    input.right = 0;
    input.jump = false;
    input.run = false;
    return;
  }
  const forward = (held.has('KeyW') || held.has('ArrowUp') ? 1 : 0) -
    (held.has('KeyS') || held.has('ArrowDown') ? 1 : 0);
  const right = (held.has('KeyD') || held.has('ArrowRight') ? 1 : 0) -
    (held.has('KeyA') || held.has('ArrowLeft') ? 1 : 0);
  input.forward = forward;
  input.right = right;
  input.run = held.has('ShiftLeft') || held.has('ShiftRight');
  input.jump = held.has('Space');
}

/** Keys the game consumes; anything else is left to the browser. */
const GAME_KEYS = new Set([
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Space',
  'ShiftLeft',
  'ShiftRight',
]);

export interface InputBindings {
  onInteract: () => void;
  onToggleMenu: () => void;
  onOpenPanel: (panel: 'missions' | 'inventory' | 'map' | 'social') => void;
  onChat: () => void;
  onEmoteWheel: (open: boolean) => void;
}

/** Attaches every listener. Returns a teardown for the effect that installs it. */
export function attachInput(target: HTMLElement, bindings: InputBindings): () => void {
  const onKeyDown = (event: KeyboardEvent) => {
    // While typing, only Escape and Enter reach the game.
    const typing =
      document.activeElement instanceof HTMLInputElement ||
      document.activeElement instanceof HTMLTextAreaElement;

    if (event.code === 'Escape') {
      bindings.onToggleMenu();
      return;
    }
    if (typing) return;

    if (GAME_KEYS.has(event.code)) {
      if (event.code === 'Space') event.preventDefault();
      held.add(event.code);
      recompute();
      return;
    }

    switch (event.code) {
      case 'KeyE':
        input.interactPressed = true;
        bindings.onInteract();
        break;
      case 'KeyM':
        bindings.onOpenPanel('map');
        break;
      case 'KeyJ':
        bindings.onOpenPanel('missions');
        break;
      case 'KeyI':
      case 'Tab':
        event.preventDefault();
        bindings.onOpenPanel('inventory');
        break;
      case 'KeyP':
        bindings.onOpenPanel('social');
        break;
      case 'Enter':
        bindings.onChat();
        break;
      case 'KeyG':
        bindings.onEmoteWheel(true);
        break;
      default:
        break;
    }
  };

  const onKeyUp = (event: KeyboardEvent) => {
    held.delete(event.code);
    recompute();
    if (event.code === 'KeyE') input.interactPressed = false;
    if (event.code === 'KeyG') bindings.onEmoteWheel(false);
  };

  const onMouseMove = (event: MouseEvent) => {
    // Only steer while the pointer is captured; otherwise moving the mouse over
    // the HUD would swing the camera.
    if (!document.pointerLockElement) return;
    input.lookX += event.movementX;
    input.lookY += event.movementY;
  };

  const onWheel = (event: WheelEvent) => {
    if (input.suspended) return;
    event.preventDefault();
    input.zoom += Math.sign(event.deltaY);
  };

  // Releasing every key on blur stops the character running forever when the
  // player alt-tabs mid-stride.
  const onBlur = () => {
    held.clear();
    recompute();
  };

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('blur', onBlur);
  target.addEventListener('wheel', onWheel, { passive: false });

  return () => {
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('blur', onBlur);
    target.removeEventListener('wheel', onWheel);
    held.clear();
    recompute();
  };
}

/**
 * Pointer lock.
 *
 * Mouse look only works while the pointer is captured, so the canvas requests
 * capture on click. The request is deliberately *not* automatic on load:
 * browsers reject a lock that was not user-initiated, and silently stealing the
 * cursor from someone who has not asked to play yet is hostile.
 */
export function requestPointerLock(target: HTMLElement): void {
  if (document.pointerLockElement === target) return;
  void target.requestPointerLock?.();
}

export function exitPointerLock(): void {
  if (document.pointerLockElement) document.exitPointerLock();
}

export function isPointerLocked(target: HTMLElement): boolean {
  return document.pointerLockElement === target;
}

/** Suspends movement while a panel is open, without losing held keys. */
export function suspendInput(suspended: boolean): void {
  input.suspended = suspended;
  recompute();
}

/** Consumes accumulated mouse look, returning the delta for this frame. */
export function consumeLook(): { x: number; y: number } {
  const delta = { x: input.lookX, y: input.lookY };
  input.lookX = 0;
  input.lookY = 0;
  return delta;
}

export function consumeZoom(): number {
  const zoom = input.zoom;
  input.zoom = 0;
  return zoom;
}

/* --------------------------------------------------------------- mobile */

/** Touch joystick output, written by the on-screen control. */
export const touchInput = { active: false, x: 0, y: 0, run: false };

export function applyTouchAxes(x: number, y: number, run: boolean): void {
  touchInput.active = true;
  touchInput.x = x;
  touchInput.y = y;
  touchInput.run = run;
}

export function clearTouchAxes(): void {
  touchInput.active = false;
  touchInput.x = 0;
  touchInput.y = 0;
  touchInput.run = false;
}

/** Touch look, driven by dragging the right half of the screen. */
export const touchLook = { x: 0, y: 0 };

export function addTouchLook(dx: number, dy: number): void {
  touchLook.x += dx;
  touchLook.y += dy;
}

export function consumeTouchLook(): { x: number; y: number } {
  const delta = { x: touchLook.x, y: touchLook.y };
  touchLook.x = 0;
  touchLook.y = 0;
  return delta;
}

/** Combined movement axes, whichever input device produced them. */
export function movementAxes(): { forward: number; right: number; run: boolean } {
  if (touchInput.active) {
    return { forward: -touchInput.y, right: touchInput.x, run: touchInput.run };
  }
  return { forward: input.forward, right: input.right, run: input.run };
}
