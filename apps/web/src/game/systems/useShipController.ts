'use client';

import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { clamp, damp } from '@nova/game-engine';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { consumeLook, consumeTouchLook, input, movementAxes } from './input';

/**
 * Arcade flight for the asteroid fields.
 *
 * Deliberately not a six-degrees-of-freedom simulator. Pitch is clamped, roll
 * is cosmetic and follows the turn, and there is no inertia to fight — the
 * point of the field is the mining, and a flight model that demands attention
 * would get in the way of it. What it does keep is momentum, so the ship feels
 * heavy rather than glued to the camera.
 */
export interface ShipFlightParams {
  readonly maxSpeed: number;
  readonly acceleration: number;
  readonly drag: number;
  readonly turnRate: number;
  readonly boostMultiplier: number;
}

export function flightParamsFor(speedStat: number): ShipFlightParams {
  // Ship speed stat maps onto flight feel without letting a fast hull become
  // uncontrollable in a dense field.
  const normalised = clamp(speedStat / 50, 0.4, 1.6);
  return {
    maxSpeed: 16 + normalised * 16,
    acceleration: 26 + normalised * 14,
    drag: 1.4,
    turnRate: 1.5,
    boostMultiplier: 1.9,
  };
}

export interface ShipFlightState {
  readonly group: React.RefObject<THREE.Group | null>;
  readonly velocity: THREE.Vector3;
  readonly position: THREE.Vector3;
  /** 0..1, drives the engine glow and the HUD throttle readout. */
  throttle: { value: number };
  boosting: { value: boolean };
}

const MIN_PITCH = -0.9;
const MAX_PITCH = 0.9;
/** The field is a sphere; flying past its edge turns the ship around. */
const FIELD_RADIUS = 260;

export function useShipController(params: ShipFlightParams): ShipFlightState {
  const camera = useThree((three) => three.camera);
  const group = useRef<THREE.Group | null>(null);

  const velocity = useMemo(() => new THREE.Vector3(), []);
  const position = useMemo(() => new THREE.Vector3(0, 0, 40), []);
  const orientation = useRef({ yaw: Math.PI, pitch: 0, roll: 0 });
  const throttle = useRef({ value: 0 });
  const boosting = useRef({ value: false });
  const forward = useMemo(() => new THREE.Vector3(), []);
  const right = useMemo(() => new THREE.Vector3(), []);
  const cameraTarget = useMemo(() => new THREE.Vector3(), []);

  useFrame((_, rawDelta) => {
    const delta = Math.min(rawDelta, 0.05);
    const settings = useSettingsStore.getState();

    /* -------------------------------------------------------- steering */
    const mouse = consumeLook();
    const touch = consumeTouchLook();
    const sensitivity = 0.0021 * settings.mouseSensitivity;
    orientation.current.yaw -= (mouse.x + touch.x) * sensitivity;
    orientation.current.pitch = clamp(
      orientation.current.pitch - (mouse.y + touch.y) * sensitivity * (settings.invertY ? -1 : 1),
      MIN_PITCH,
      MAX_PITCH,
    );

    /* ---------------------------------------------------------- thrust */
    const axes = movementAxes();
    boosting.current.value = axes.run;
    const target = clamp(axes.forward, -0.6, 1);
    throttle.current.value = damp(throttle.current.value, Math.max(0, target), 6, delta);

    forward.set(
      Math.sin(orientation.current.yaw) * Math.cos(orientation.current.pitch),
      Math.sin(orientation.current.pitch),
      Math.cos(orientation.current.yaw) * Math.cos(orientation.current.pitch),
    );
    right.set(Math.cos(orientation.current.yaw), 0, -Math.sin(orientation.current.yaw));

    const power = params.acceleration * (axes.run ? params.boostMultiplier : 1);
    velocity.addScaledVector(forward, target * power * delta);
    velocity.addScaledVector(right, axes.right * power * 0.45 * delta);
    if (input.jump) velocity.y += power * 0.4 * delta;

    // Drag, and a hard speed cap so boost cannot accumulate indefinitely.
    velocity.multiplyScalar(Math.max(0, 1 - params.drag * delta));
    const cap = params.maxSpeed * (axes.run ? params.boostMultiplier : 1);
    if (velocity.length() > cap) velocity.setLength(cap);

    position.addScaledVector(velocity, delta);

    // Turn the ship around at the field boundary rather than letting it drift
    // into empty space forever.
    if (position.length() > FIELD_RADIUS) {
      position.setLength(FIELD_RADIUS);
      velocity.multiplyScalar(-0.25);
    }

    /* ------------------------------------------------------------ hull */
    if (group.current) {
      group.current.position.copy(position);
      orientation.current.roll = damp(orientation.current.roll, -axes.right * 0.55, 5, delta);
      group.current.rotation.set(
        -orientation.current.pitch,
        orientation.current.yaw + Math.PI,
        orientation.current.roll,
      );
    }

    /* ---------------------------------------------------------- camera */
    const distance = 9 + throttle.current.value * 3;
    cameraTarget.set(
      position.x - forward.x * distance,
      position.y - forward.y * distance + 2.6,
      position.z - forward.z * distance,
    );
    const lambda = settings.reducedMotion ? 30 : 7;
    camera.position.x = damp(camera.position.x, cameraTarget.x, lambda, delta);
    camera.position.y = damp(camera.position.y, cameraTarget.y, lambda, delta);
    camera.position.z = damp(camera.position.z, cameraTarget.z, lambda, delta);
    camera.lookAt(position.x, position.y, position.z);
  });

  return {
    group,
    velocity,
    position,
    throttle: throttle.current,
    boosting: boosting.current,
  };
}
