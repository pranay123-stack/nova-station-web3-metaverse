'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import {
  INTERACTABLES,
  SPAWN_POINT,
  SPAWN_YAW,
  areaAtPosition,
  getStationGeometry,
  type StationAreaId,
} from '@nova/game-data';
import {
  DEFAULT_CHARACTER_PARAMS,
  createCharacterState,
  createCollisionWorld,
  damp,
  distance2D,
  stepCharacter,
  type CharacterState,
} from '@nova/game-engine';
import { useGameStore } from '@/stores/useGameStore';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { gameSocket } from '@/game/net/socket';
import { consumeLook, consumeTouchLook, consumeZoom, input, movementAxes } from './input';
import { playFootstep } from '@/game/audio/engine';

/**
 * The player's body and camera.
 *
 * The controller runs the *same* `stepCharacter` the server uses to validate
 * movement, so what the player sees and what the server accepts are computed by
 * one piece of code. Prediction is local and immediate; the server only ever
 * corrects, and a correction is applied by easing the body back rather than
 * snapping it, which reads as a stumble instead of a glitch.
 *
 * Nothing in this hook writes React state during a frame. Area changes and
 * proximity prompts are pushed into the store, but each is guarded so it fires
 * only when the value actually changes.
 */
const world = createCollisionWorld(getStationGeometry());
const params = DEFAULT_CHARACTER_PARAMS;

const MIN_PITCH = -0.55;
// A steeper look-down puts the camera above the ceiling, which is drawn but is
// deliberately not collidable — so the pitch is capped instead of adding a
// collider that would also block the sector lights.
const MAX_PITCH = 0.82;
const MIN_DISTANCE = 2.4;
const MAX_DISTANCE = 14;
const FOOTSTEP_INTERVAL = 0.42;
const MAX_CAMERA_HEIGHT = 6;

export interface CharacterHandle {
  readonly state: CharacterState;
  readonly group: React.RefObject<THREE.Group | null>;
  teleport: (x: number, y: number, z: number) => void;
}

export function useCharacter(): CharacterHandle {
  const camera = useThree((three) => three.camera);
  const group = useRef<THREE.Group | null>(null);

  const character = useMemo(
    () =>
      createCharacterState(
        { x: SPAWN_POINT[0], y: SPAWN_POINT[1], z: SPAWN_POINT[2] },
        SPAWN_YAW,
      ),
    [],
  );

  // Camera orbit, kept out of React so it can be mutated every frame.
  const orbit = useRef({ yaw: SPAWN_YAW, pitch: 0.32, distance: 7.5 });
  const cameraTarget = useRef(new THREE.Vector3(SPAWN_POINT[0], 1.2, SPAWN_POINT[2]));
  const correction = useRef<{ x: number; y: number; z: number } | null>(null);
  const footstepTimer = useRef(0);
  const lastArea = useRef<StationAreaId>('habitat');

  useEffect(() => {
    orbit.current.distance = useSettingsStore.getState().cameraDistance;
  }, []);

  // A server correction eases the body back over a few frames.
  useEffect(() => {
    gameSocket.onCorrection = (position) => {
      correction.current = position;
    };
    return () => {
      gameSocket.onCorrection = null;
    };
  }, []);

  useFrame((_, rawDelta) => {
    const delta = Math.min(rawDelta, 0.05);
    const settings = useSettingsStore.getState();

    /* ------------------------------------------------------------ look */
    const mouse = consumeLook();
    const touch = consumeTouchLook();
    const sensitivity = 0.0022 * settings.mouseSensitivity;
    orbit.current.yaw -= (mouse.x + touch.x) * sensitivity;
    const pitchDelta = (mouse.y + touch.y) * sensitivity * (settings.invertY ? -1 : 1);
    orbit.current.pitch = Math.max(
      MIN_PITCH,
      Math.min(MAX_PITCH, orbit.current.pitch + pitchDelta),
    );

    const zoom = consumeZoom();
    if (zoom !== 0) {
      orbit.current.distance = Math.max(
        MIN_DISTANCE,
        Math.min(MAX_DISTANCE, orbit.current.distance + zoom * 0.9),
      );
    }

    /* -------------------------------------------------------- movement */
    const axes = movementAxes();
    const wasGrounded = character.grounded;
    const result = stepCharacter(
      character,
      {
        moveX: axes.right,
        moveZ: -axes.forward,
        lookYaw: orbit.current.yaw,
        jump: input.jump,
        run: axes.run,
      },
      params,
      world,
      delta,
    );

    /* ------------------------------------------------------ correction */
    if (correction.current) {
      const target = correction.current;
      character.position.x = damp(character.position.x, target.x, 12, delta);
      character.position.y = damp(character.position.y, target.y, 12, delta);
      character.position.z = damp(character.position.z, target.z, 12, delta);
      if (distance2D(character.position.x, character.position.z, target.x, target.z) < 0.05) {
        correction.current = null;
      }
    }

    /* ------------------------------------------------------------ body */
    if (group.current) {
      group.current.position.set(character.position.x, character.position.y, character.position.z);
      group.current.rotation.y = damp(group.current.rotation.y, character.yaw, 14, delta);
    }

    /* ---------------------------------------------------------- camera */
    const targetHeight = 1.35;
    cameraTarget.current.set(
      character.position.x,
      character.position.y + targetHeight,
      character.position.z,
    );

    const desiredDistance = cameraDistanceWithoutClipping(
      cameraTarget.current,
      orbit.current.yaw,
      orbit.current.pitch,
      orbit.current.distance,
    );

    const horizontal = Math.cos(orbit.current.pitch) * desiredDistance;
    const wanted = new THREE.Vector3(
      cameraTarget.current.x + Math.sin(orbit.current.yaw) * horizontal,
      // Hard ceiling on how far above the player the camera may sit, so it
      // cannot rise through a roof and leave the station visible from outside.
      Math.min(
        cameraTarget.current.y + Math.sin(orbit.current.pitch) * desiredDistance,
        character.position.y + MAX_CAMERA_HEIGHT,
      ),
      cameraTarget.current.z + Math.cos(orbit.current.yaw) * horizontal,
    );

    // Reduced motion means no camera smoothing lag, which is the part of a
    // third-person camera that provokes motion sickness.
    const lambda = settings.reducedMotion ? 40 : 14;
    camera.position.x = damp(camera.position.x, wanted.x, lambda, delta);
    camera.position.y = damp(camera.position.y, wanted.y, lambda, delta);
    camera.position.z = damp(camera.position.z, wanted.z, lambda, delta);
    camera.lookAt(cameraTarget.current);

    /* ------------------------------------------------------ networking */
    const pose = gameSocket.pose;
    pose.x = character.position.x;
    pose.y = character.position.y;
    pose.z = character.position.z;
    pose.yaw = character.yaw;
    pose.state = !character.grounded
      ? character.velocityY > 0
        ? 'jump'
        : 'fall'
      : Math.hypot(character.velocityX, character.velocityZ) > 0.4
        ? axes.run
          ? 'run'
          : 'walk'
        : 'idle';

    /* ----------------------------------------------------------- audio */
    if (character.grounded && result.distance > 0.01) {
      footstepTimer.current -= delta * (axes.run ? 1.6 : 1);
      if (footstepTimer.current <= 0) {
        footstepTimer.current = FOOTSTEP_INTERVAL;
        playFootstep();
      }
    } else {
      footstepTimer.current = 0;
    }
    if (result.landed && !wasGrounded) {
      playFootstep(true);
    }

    /* ------------------------------------------------------------ area */
    const area = areaAtPosition(character.position.x, character.position.z);
    if (area !== lastArea.current) {
      lastArea.current = area;
      useGameStore.getState().setArea(area);
      gameSocket.sendArea(area);
    }

    /* ------------------------------------------------------- proximity */
    updateNearby(character.position.x, character.position.z);
  });

  return {
    state: character,
    group,
    teleport(x, y, z) {
      character.position.x = x;
      character.position.y = y;
      character.position.z = z;
      character.velocityX = 0;
      character.velocityY = 0;
      character.velocityZ = 0;
      correction.current = null;
    },
  };
}

/**
 * Pulls the camera in when a wall would otherwise be between it and the player.
 *
 * A simple ray march is enough here: the station is boxes, and a handful of
 * samples costs far less than a proper sweep while producing the same result at
 * the distances involved.
 */
function cameraDistanceWithoutClipping(
  target: THREE.Vector3,
  yaw: number,
  pitch: number,
  desired: number,
): number {
  const steps = 6;
  for (let i = steps; i >= 1; i -= 1) {
    const distance = (desired * i) / steps;
    const horizontal = Math.cos(pitch) * distance;
    const x = target.x + Math.sin(yaw) * horizontal;
    const z = target.z + Math.cos(yaw) * horizontal;
    const y = target.y + Math.sin(pitch) * distance;
    if (!pointInsideSolid(x, y, z)) return distance;
  }
  return MIN_DISTANCE;
}

const solids = getStationGeometry().solids;

function pointInsideSolid(x: number, y: number, z: number): boolean {
  for (const solid of solids) {
    if (
      x > solid.min[0] - 0.3 &&
      x < solid.max[0] + 0.3 &&
      y > solid.min[1] &&
      y < solid.max[1] &&
      z > solid.min[2] - 0.3 &&
      z < solid.max[2] + 0.3
    ) {
      return true;
    }
  }
  return false;
}

/** Finds the closest interactable in range and publishes it for the HUD. */
function updateNearby(x: number, z: number): void {
  let best: (typeof INTERACTABLES)[number] | null = null;
  let bestDistance = Infinity;

  for (const item of INTERACTABLES) {
    const distance = distance2D(x, z, item.position[0], item.position[2]);
    if (distance <= item.radius && distance < bestDistance) {
      best = item;
      bestDistance = distance;
    }
  }

  useGameStore
    .getState()
    .setNearby(best ? { id: best.id, label: best.label, prompt: best.prompt } : null);
}
