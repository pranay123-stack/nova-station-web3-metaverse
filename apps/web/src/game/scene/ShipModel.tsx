'use client';

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { SHIPS_BY_ID, type ShipDef } from '@nova/game-data';
import { useSettingsStore } from '@/stores/useSettingsStore';

/**
 * Spacecraft, built from primitives per silhouette.
 *
 * Five silhouettes cover the five classes, and each ship's palette comes from
 * its catalogue entry — so a Kestrel is recognisably a Kestrel wherever it is
 * drawn: parked in the hangar, flown in the belt, or spinning in a marketplace
 * card.
 */
export interface ShipModelProps {
  readonly defId: string;
  readonly scale?: number;
  /** Engine glow intensity, 0..1. Driven by throttle in the field scene. */
  readonly thrust?: number;
  readonly spin?: boolean;
}

export function ShipModel({ defId, scale = 1, thrust = 0.2, spin = false }: ShipModelProps) {
  const def = SHIPS_BY_ID.get(defId);
  const group = useRef<THREE.Group>(null);
  const glow = useRef<THREE.Mesh>(null);

  useFrame((state, delta) => {
    if (spin && group.current && !useSettingsStore.getState().reducedMotion) {
      group.current.rotation.y += delta * 0.35;
    }
    if (glow.current) {
      const material = glow.current.material as THREE.MeshBasicMaterial;
      material.opacity = 0.35 + thrust * 0.5 + Math.sin(state.clock.elapsedTime * 9) * 0.06;
    }
  });

  if (!def) return null;

  return (
    <group ref={group} scale={scale}>
      <Silhouette def={def} />
      {/* Engine bloom */}
      <mesh ref={glow} position={[0, 0, 1.5]} rotation={[Math.PI / 2, 0, 0]}>
        <coneGeometry args={[0.32, 1.4 + thrust * 1.2, 12, 1, true]} />
        <meshBasicMaterial
          color={def.palette.glow}
          transparent
          opacity={0.5}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

function Silhouette({ def }: { def: ShipDef }) {
  const hull = def.palette.hull;
  const trim = def.palette.trim;
  const glow = def.palette.glow;

  const hullMaterial = (
    <meshStandardMaterial color={hull} metalness={0.85} roughness={0.28} />
  );
  const trimMaterial = (
    <meshStandardMaterial color={trim} emissive={glow} emissiveIntensity={0.8} metalness={0.6} roughness={0.3} />
  );

  switch (def.silhouette) {
    case 'dart':
      return (
        <group>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <coneGeometry args={[0.42, 2.6, 10]} />
            {hullMaterial}
          </mesh>
          <mesh position={[0, 0, 0.6]}>
            <boxGeometry args={[2.3, 0.09, 0.7]} />
            {trimMaterial}
          </mesh>
          <mesh position={[0, 0.22, -0.35]}>
            <sphereGeometry args={[0.24, 12, 10]} />
            <meshStandardMaterial color={glow} emissive={glow} emissiveIntensity={1.4} transparent opacity={0.8} />
          </mesh>
        </group>
      );

    case 'rig':
      return (
        <group>
          <mesh>
            <boxGeometry args={[1.1, 0.9, 2.2]} />
            {hullMaterial}
          </mesh>
          {/* Drill head */}
          <mesh position={[0, 0, -1.7]} rotation={[-Math.PI / 2, 0, 0]}>
            <coneGeometry args={[0.44, 1.3, 8]} />
            {trimMaterial}
          </mesh>
          <mesh position={[-0.8, 0, 0.4]}>
            <boxGeometry args={[0.34, 0.34, 1.5]} />
            {hullMaterial}
          </mesh>
          <mesh position={[0.8, 0, 0.4]}>
            <boxGeometry args={[0.34, 0.34, 1.5]} />
            {hullMaterial}
          </mesh>
        </group>
      );

    case 'hauler':
      return (
        <group>
          <mesh>
            <boxGeometry args={[1.5, 1.2, 3.4]} />
            {hullMaterial}
          </mesh>
          <mesh position={[0, 0.75, -0.9]}>
            <boxGeometry args={[0.9, 0.5, 0.9]} />
            {trimMaterial}
          </mesh>
          {[-1, 1].map((side) => (
            <mesh key={side} position={[side * 1.15, 0, 0.3]}>
              <boxGeometry args={[0.6, 0.9, 2.4]} />
              {hullMaterial}
            </mesh>
          ))}
        </group>
      );

    case 'wing':
      return (
        <group>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <capsuleGeometry args={[0.36, 2.1, 4, 12]} />
            {hullMaterial}
          </mesh>
          <mesh position={[0, 0, 0.2]} rotation={[0, 0, 0]}>
            <boxGeometry args={[3.4, 0.07, 1.1]} />
            {trimMaterial}
          </mesh>
          <mesh position={[0, 0.3, -1.1]}>
            <sphereGeometry args={[0.26, 12, 10]} />
            <meshStandardMaterial color={glow} emissive={glow} emissiveIntensity={1.6} transparent opacity={0.85} />
          </mesh>
          {/* Sensor mast */}
          <mesh position={[0, 0.55, 0.6]}>
            <cylinderGeometry args={[0.03, 0.03, 1.1, 6]} />
            {trimMaterial}
          </mesh>
        </group>
      );

    case 'lance':
    default:
      return (
        <group>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.3, 0.46, 3, 8]} />
            {hullMaterial}
          </mesh>
          {[-1, 1].map((side) => (
            <mesh key={side} position={[side * 0.75, 0, 0.5]} rotation={[0, 0, side * 0.35]}>
              <boxGeometry args={[0.16, 1.4, 1.6]} />
              {trimMaterial}
            </mesh>
          ))}
          <mesh position={[0, 0, -1.9]}>
            <boxGeometry args={[0.14, 0.14, 1]} />
            <meshStandardMaterial color={glow} emissive={glow} emissiveIntensity={2} />
          </mesh>
        </group>
      );
  }
}

/** The hangar floor display: the player's hulls parked on their pads. */
export function HangarShips({ ships }: { ships: readonly { defId: string; active: boolean }[] }) {
  return (
    <group name="hangar-ships">
      {ships.slice(0, 6).map((ship, index) => {
        const column = index % 3;
        const row = Math.floor(index / 3);
        return (
          <group
            key={`${ship.defId}-${index}`}
            position={[-98 + column * 18, 1.6, -84 + row * 26]}
            rotation={[0, Math.PI / 2, 0]}
          >
            <ShipModel defId={ship.defId} scale={2.1} thrust={ship.active ? 0.5 : 0.05} />
          </group>
        );
      })}
    </group>
  );
}
