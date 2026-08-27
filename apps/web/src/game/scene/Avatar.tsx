'use client';

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { COSMETICS_BY_ID } from '@nova/game-data';
import type { MovementState } from '@nova/shared';

/**
 * The player body.
 *
 * Built from primitives and animated procedurally rather than loaded from a
 * rigged GLB. Three reasons, in order of weight: it downloads in zero bytes; a
 * procedural walk cycle blends between states with no animation graph; and the
 * whole thing is parameterised by the avatar's cosmetic choices, so a suit
 * colour is a uniform rather than a texture variant.
 *
 * The rig is a hierarchy of groups — hips, torso, head, four limbs — driven by
 * sine waves whose frequency follows the character's speed.
 */
export interface AvatarLook {
  readonly suitId: string;
  readonly helmetId: string;
  readonly suitPattern: string;
  readonly visor: string;
  readonly emblem: string;
  readonly accessory: string;
  readonly primaryColor: string;
  readonly secondaryColor: string;
}

export const DEFAULT_LOOK: AvatarLook = {
  suitId: 'suit_standard',
  helmetId: 'helmet_standard',
  suitPattern: 'pattern_plain',
  visor: 'visor_ice',
  emblem: 'emblem_federation',
  accessory: 'accessory_pack',
  primaryColor: '#38bdf8',
  secondaryColor: '#0f172a',
};

export interface AvatarProps {
  readonly look: AvatarLook;
  /** Horizontal speed, metres per second, driving the walk cycle. */
  readonly speed?: number;
  readonly state?: MovementState;
  /** Emote currently playing, cleared by the caller when it finishes. */
  readonly emote?: string | null;
  readonly scale?: number;
}

function visorColor(look: AvatarLook): string {
  const cosmetic = COSMETICS_BY_ID.get(look.visor);
  const color = cosmetic?.render.color;
  return typeof color === 'string' ? color : '#7dd3fc';
}

function emblemColor(look: AvatarLook): string {
  const cosmetic = COSMETICS_BY_ID.get(look.emblem);
  const color = cosmetic?.render.color;
  return typeof color === 'string' ? color : '#60a5fa';
}

export function Avatar({ look, speed = 0, state = 'idle', emote = null, scale = 1 }: AvatarProps) {
  const hips = useRef<THREE.Group>(null);
  const torso = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const armL = useRef<THREE.Group>(null);
  const armR = useRef<THREE.Group>(null);
  const legL = useRef<THREE.Group>(null);
  const legR = useRef<THREE.Group>(null);
  const phase = useRef(0);

  const suit = useMemo(() => new THREE.Color(look.primaryColor), [look.primaryColor]);
  const trim = useMemo(() => new THREE.Color(look.secondaryColor), [look.secondaryColor]);
  const visor = useMemo(() => visorColor(look), [look]);
  const emblem = useMemo(() => emblemColor(look), [look]);

  useFrame((_, delta) => {
    const step = Math.min(delta, 0.05);
    const moving = speed > 0.3;
    // Stride frequency rises with speed, which is what makes a run read as a
    // run rather than a fast walk.
    const cadence = moving ? 2.2 + Math.min(speed, 10) * 0.55 : 0;
    phase.current += step * cadence;

    const swing = moving ? Math.min(0.7, 0.16 + speed * 0.06) : 0;
    const sin = Math.sin(phase.current * Math.PI);
    const cos = Math.cos(phase.current * Math.PI);

    if (legL.current) legL.current.rotation.x = sin * swing;
    if (legR.current) legR.current.rotation.x = -sin * swing;
    if (armL.current) armL.current.rotation.x = -sin * swing * 0.8;
    if (armR.current) armR.current.rotation.x = sin * swing * 0.8;

    if (hips.current) {
      // A slight vertical bob and lean sells the weight of the body.
      hips.current.position.y = moving ? Math.abs(cos) * 0.045 : Math.sin(phase.current * 0.6) * 0.012;
      hips.current.rotation.z = moving ? sin * 0.03 : 0;
    }
    if (torso.current) {
      torso.current.rotation.x = moving ? Math.min(0.16, speed * 0.014) : 0;
      torso.current.rotation.y = moving ? -sin * 0.06 : 0;
    }

    if (state === 'jump' || state === 'fall') {
      if (legL.current) legL.current.rotation.x = -0.5;
      if (legR.current) legR.current.rotation.x = 0.3;
      if (armL.current) armL.current.rotation.x = -1.1;
      if (armR.current) armR.current.rotation.x = -1.1;
    }

    if (emote && head.current) {
      const t = phase.current * 2;
      switch (emote) {
        case 'wave':
          if (armR.current) {
            armR.current.rotation.x = -2.3;
            armR.current.rotation.z = Math.sin(t * 3) * 0.4 - 0.3;
          }
          break;
        case 'salute':
          if (armR.current) {
            armR.current.rotation.x = -2.6;
            armR.current.rotation.z = -0.7;
          }
          break;
        case 'cheer':
          if (armL.current) armL.current.rotation.x = -2.8;
          if (armR.current) armR.current.rotation.x = -2.8;
          if (hips.current) hips.current.position.y = Math.abs(Math.sin(t * 3)) * 0.16;
          break;
        case 'point':
          if (armR.current) armR.current.rotation.x = -1.6;
          break;
        case 'sit':
          if (hips.current) hips.current.position.y = -0.35;
          if (legL.current) legL.current.rotation.x = -1.4;
          if (legR.current) legR.current.rotation.x = -1.4;
          break;
        case 'dance':
          if (hips.current) {
            hips.current.rotation.y = Math.sin(t * 2) * 0.5;
            hips.current.position.y = Math.abs(Math.sin(t * 4)) * 0.1;
          }
          if (armL.current) armL.current.rotation.x = Math.sin(t * 4) * 1.4 - 1;
          if (armR.current) armR.current.rotation.x = -Math.sin(t * 4) * 1.4 - 1;
          break;
        default:
          break;
      }
    }
  });

  return (
    <group ref={hips} scale={scale} name="avatar">
      {/* Legs, hung from the hips at 0.9m. */}
      <group ref={legL} position={[-0.15, 0.9, 0]}>
        <mesh position={[0, -0.45, 0]}>
          <capsuleGeometry args={[0.11, 0.62, 4, 8]} />
          <meshStandardMaterial color={trim} metalness={0.4} roughness={0.6} />
        </mesh>
        <mesh position={[0, -0.86, 0.05]}>
          <boxGeometry args={[0.16, 0.1, 0.3]} />
          <meshStandardMaterial color="#1b2430" metalness={0.5} roughness={0.5} />
        </mesh>
      </group>
      <group ref={legR} position={[0.15, 0.9, 0]}>
        <mesh position={[0, -0.45, 0]}>
          <capsuleGeometry args={[0.11, 0.62, 4, 8]} />
          <meshStandardMaterial color={trim} metalness={0.4} roughness={0.6} />
        </mesh>
        <mesh position={[0, -0.86, 0.05]}>
          <boxGeometry args={[0.16, 0.1, 0.3]} />
          <meshStandardMaterial color="#1b2430" metalness={0.5} roughness={0.5} />
        </mesh>
      </group>

      {/* Torso */}
      <group ref={torso} position={[0, 0.9, 0]}>
        <mesh position={[0, 0.28, 0]}>
          <capsuleGeometry args={[0.21, 0.34, 4, 10]} />
          <meshStandardMaterial color={suit} metalness={0.45} roughness={0.45} />
        </mesh>
        {/* Chest light: the single strongest read at distance. */}
        <mesh position={[0, 0.34, 0.2]}>
          <boxGeometry args={[0.16, 0.05, 0.03]} />
          <meshStandardMaterial color={visor} emissive={visor} emissiveIntensity={2.4} />
        </mesh>
        {/* Shoulder emblem */}
        <mesh position={[-0.2, 0.4, 0.02]} rotation={[0, 0, 0.3]}>
          <boxGeometry args={[0.09, 0.09, 0.02]} />
          <meshStandardMaterial color={emblem} emissive={emblem} emissiveIntensity={1.1} />
        </mesh>

        {look.accessory === 'accessory_pack' && (
          <mesh position={[0, 0.3, -0.2]}>
            <boxGeometry args={[0.3, 0.34, 0.14]} />
            <meshStandardMaterial color="#25303f" metalness={0.6} roughness={0.4} />
          </mesh>
        )}
        {look.accessory === 'accessory_antenna' && (
          <mesh position={[0.16, 0.62, -0.12]} rotation={[0.2, 0, -0.25]}>
            <cylinderGeometry args={[0.012, 0.012, 0.7, 6]} />
            <meshStandardMaterial color="#8ea3bf" emissive={visor} emissiveIntensity={0.5} />
          </mesh>
        )}
        {look.accessory === 'accessory_wings' && (
          <>
            <mesh position={[-0.3, 0.32, -0.12]} rotation={[0, 0.4, 0.5]}>
              <boxGeometry args={[0.42, 0.02, 0.16]} />
              <meshStandardMaterial color={visor} emissive={visor} emissiveIntensity={1.4} />
            </mesh>
            <mesh position={[0.3, 0.32, -0.12]} rotation={[0, -0.4, -0.5]}>
              <boxGeometry args={[0.42, 0.02, 0.16]} />
              <meshStandardMaterial color={visor} emissive={visor} emissiveIntensity={1.4} />
            </mesh>
          </>
        )}

        {/* Arms */}
        <group ref={armL} position={[-0.28, 0.42, 0]}>
          <mesh position={[0, -0.26, 0]}>
            <capsuleGeometry args={[0.075, 0.4, 4, 8]} />
            <meshStandardMaterial color={suit} metalness={0.45} roughness={0.5} />
          </mesh>
        </group>
        <group ref={armR} position={[0.28, 0.42, 0]}>
          <mesh position={[0, -0.26, 0]}>
            <capsuleGeometry args={[0.075, 0.4, 4, 8]} />
            <meshStandardMaterial color={suit} metalness={0.45} roughness={0.5} />
          </mesh>
        </group>

        {/* Head and helmet */}
        <group ref={head} position={[0, 0.62, 0]}>
          <mesh>
            <sphereGeometry args={[0.16, 18, 14]} />
            <meshStandardMaterial color={trim} metalness={0.5} roughness={0.35} />
          </mesh>
          <mesh position={[0, 0.01, 0.09]}>
            <sphereGeometry args={[0.135, 18, 14, 0, Math.PI * 2, 0, Math.PI * 0.55]} />
            <meshStandardMaterial
              color={visor}
              emissive={visor}
              emissiveIntensity={1.6}
              metalness={0.1}
              roughness={0.05}
              transparent
              opacity={0.85}
            />
          </mesh>
          <mesh position={[0.15, 0.06, 0.02]}>
            <boxGeometry args={[0.05, 0.03, 0.06]} />
            <meshStandardMaterial color="#f8fafc" emissive="#f8fafc" emissiveIntensity={2} />
          </mesh>
        </group>
      </group>
    </group>
  );
}
