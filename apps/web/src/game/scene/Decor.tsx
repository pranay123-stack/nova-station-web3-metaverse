'use client';

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { AREA_GRAPH, STATION_DECOR, STATION_LIGHTS, type DecorItem } from '@nova/game-data';
import { useGameStore } from '@/stores/useGameStore';
import { useSettingsStore } from '@/stores/useSettingsStore';

/**
 * Holograms, pipes, viewports and signage.
 *
 * These are the pieces that make the station feel inhabited rather than
 * modelled, and they are the first thing dropped on low quality: they carry
 * atmosphere, not information.
 */
export function Decor() {
  const quality = useSettingsStore((state) => state.quality);
  const items = useMemo(
    () => (quality === 'low' ? STATION_DECOR.filter((item) => item.kind !== 'holo') : STATION_DECOR),
    [quality],
  );

  return (
    <group name="decor">
      {items.map((item) => (
        <DecorPiece key={item.id} item={item} />
      ))}
    </group>
  );
}

function DecorPiece({ item }: { item: DecorItem }) {
  const ref = useRef<THREE.Mesh>(null);
  const base = useRef(item.position[1]);

  useFrame((state) => {
    const mesh = ref.current;
    if (!mesh) return;
    if (useSettingsStore.getState().reducedMotion) return;
    if (item.spin) mesh.rotation.y += item.spin * state.clock.getDelta() * 60 * 0.016;
    if (item.bob) {
      mesh.position.y = base.current + Math.sin(state.clock.elapsedTime * 0.8) * item.bob;
    }
  });

  const material = (
    <meshStandardMaterial
      color={item.color}
      metalness={item.metalness ?? 0.3}
      roughness={item.roughness ?? 0.4}
      transparent={item.opacity !== undefined}
      opacity={item.opacity ?? 1}
      side={item.opacity !== undefined ? THREE.DoubleSide : THREE.FrontSide}
      {...(item.emissive
        ? { emissive: item.emissive, emissiveIntensity: item.emissiveIntensity ?? 1 }
        : {})}
    />
  );

  return (
    <mesh
      ref={ref}
      position={item.position as unknown as [number, number, number]}
      rotation={item.rotation as unknown as [number, number, number]}
    >
      <DecorGeometry item={item} />
      {material}
    </mesh>
  );
}

function DecorGeometry({ item }: { item: DecorItem }) {
  // Depth is unused: every decor primitive is either radial or a plane.
  const [sx, sy] = item.scale;
  switch (item.kind) {
    case 'cylinder':
      return <cylinderGeometry args={[sx, sx, sy, 20, 1, true]} />;
    case 'sphere':
      return <sphereGeometry args={[sx, 20, 16]} />;
    case 'torus':
      return <torusGeometry args={[sx, sx * 0.12, 10, 32]} />;
    case 'cone':
      return <coneGeometry args={[sx, sy, 16]} />;
    case 'ring':
      return <ringGeometry args={[sx * 0.82, sx, 40]} />;
    case 'pipe':
      return <cylinderGeometry args={[sx, sx, sy, 10]} />;
    case 'holo':
      // A stack of rings reads as a rotating hologram far more cheaply than a
      // shader would, and it silhouettes well from any angle.
      return <icosahedronGeometry args={[sx, 1]} />;
    case 'window':
    case 'panel':
    default:
      return <planeGeometry args={[sx, sy]} />;
  }
}

/**
 * The area a player is in gets its lights; everything else is dark.
 *
 * Eleven point lights would all be evaluated by every fragment in the scene.
 * Enabling only the current area's lights, plus its neighbours so corridors do
 * not go black, keeps the shader cost flat wherever the player stands.
 */
export function AreaLights() {
  const area = useGameStore((state) => state.area);
  const quality = useSettingsStore((state) => state.quality);

  const active = useMemo(() => {
    const neighbours = new Set<string>([area, ...(AREA_GRAPH[area] ?? [])]);
    const lights = STATION_LIGHTS.filter((light) => neighbours.has(light.area));
    // Low quality keeps only the brightest light per area.
    if (quality !== 'low') return lights;
    const byArea = new Map<string, (typeof lights)[number]>();
    for (const light of lights) {
      const current = byArea.get(light.area);
      if (!current || light.intensity > current.intensity) byArea.set(light.area, light);
    }
    return [...byArea.values()];
  }, [area, quality]);

  return (
    <group name="area-lights">
      {active.map((light) => (
        <pointLight
          key={light.id}
          position={light.position as unknown as [number, number, number]}
          color={light.color}
          intensity={light.intensity}
          distance={light.distance}
          decay={2}
        />
      ))}
    </group>
  );
}
