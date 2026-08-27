'use client';

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Billboard, Text } from '@react-three/drei';
import * as THREE from 'three';
import { INTERACTABLES, type InteractableDef } from '@nova/game-data';
import { useGameStore } from '@/stores/useGameStore';

/**
 * Terminals, benches and consoles.
 *
 * Each is a small physical object plus a floating label that only appears when
 * the player is close enough to use it — which is exactly the range the server
 * re-checks before honouring the action.
 */
export function Interactables() {
  return (
    <group name="interactables">
      {INTERACTABLES.map((item) => (
        <Interactable key={item.id} item={item} />
      ))}
    </group>
  );
}

function Interactable({ item }: { item: InteractableDef }) {
  const ring = useRef<THREE.Mesh>(null);
  const glow = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    const time = state.clock.elapsedTime;
    if (ring.current) ring.current.rotation.z = time * 0.5;
    if (glow.current) {
      const material = glow.current.material as THREE.MeshStandardMaterial;
      material.emissiveIntensity = 1.6 + Math.sin(time * 2.4) * 0.5;
    }
  });

  const [x, y, z] = item.position;

  return (
    <group position={[x, y, z]} rotation={[0, item.rotationY, 0]}>
      {/* Console body */}
      <mesh position={[0, 0.55, 0]}>
        <boxGeometry args={[1.1, 1.1, 0.6]} />
        <meshStandardMaterial color="#141d29" metalness={0.7} roughness={0.35} />
      </mesh>
      {/* Angled screen */}
      <mesh ref={glow} position={[0, 1.22, 0.16]} rotation={[-0.42, 0, 0]}>
        <planeGeometry args={[0.86, 0.56]} />
        <meshStandardMaterial
          color={item.color}
          emissive={item.color}
          emissiveIntensity={1.8}
          transparent
          opacity={0.9}
          side={THREE.DoubleSide}
        />
      </mesh>
      {/* Floor marker */}
      <mesh ref={ring} position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[item.radius * 0.85, item.radius, 40]} />
        <meshStandardMaterial
          color={item.color}
          emissive={item.color}
          emissiveIntensity={1.1}
          transparent
          opacity={0.28}
          side={THREE.DoubleSide}
        />
      </mesh>
      <ProximityLabel id={item.id} label={item.label} color={item.color} />
    </group>
  );
}

function ProximityLabel({ id, label, color }: { id: string; label: string; color: string }) {
  const near = useGameStore((state) => state.nearby?.id === id);
  if (!near) return null;

  return (
    <Billboard position={[0, 2.1, 0]}>
      <Text
        fontSize={0.22}
        color={color}
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.014}
        outlineColor="#020617"
      >
        {label}
      </Text>
    </Billboard>
  );
}
