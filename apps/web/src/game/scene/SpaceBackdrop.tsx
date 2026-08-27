'use client';

import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { createRng } from '@nova/game-engine';
import { useSettingsStore } from '@/stores/useSettingsStore';

/**
 * The view outside.
 *
 * Stars are a single `Points` cloud, the planet is one sphere, and the traffic
 * is a handful of instanced hulls on fixed orbits. Together they cost three
 * draw calls and do more for the feeling of being in orbit than any amount of
 * interior detail would.
 */
export function SpaceBackdrop() {
  const quality = useSettingsStore((state) => state.quality);
  const starCount = quality === 'low' ? 1200 : quality === 'medium' ? 3000 : 6000;

  return (
    <group name="space">
      <Starfield count={starCount} />
      <Planet />
      {quality !== 'low' && <Traffic count={quality === 'high' ? 10 : 5} />}
      <Nebula />
    </group>
  );
}

function Starfield({ count }: { count: number }) {
  const geometry = useMemo(() => {
    // A fixed seed means the sky is the same on every load and for every
    // player, which matters when two people are looking out of the same window.
    const rng = createRng(0x51a25);
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const radius = 900;

    for (let i = 0; i < count; i += 1) {
      // Uniform distribution on a sphere; a naive angle pick clusters at poles.
      const u = rng.next() * 2 - 1;
      const theta = rng.next() * Math.PI * 2;
      const planar = Math.sqrt(1 - u * u);
      positions[i * 3] = planar * Math.cos(theta) * radius;
      positions[i * 3 + 1] = u * radius;
      positions[i * 3 + 2] = planar * Math.sin(theta) * radius;

      const warmth = rng.next();
      colors[i * 3] = 0.7 + warmth * 0.3;
      colors[i * 3 + 1] = 0.75 + warmth * 0.2;
      colors[i * 3 + 2] = 0.9 + (1 - warmth) * 0.1;
    }

    const buffer = new THREE.BufferGeometry();
    buffer.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    buffer.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return buffer;
  }, [count]);

  return (
    <points geometry={geometry} frustumCulled={false}>
      <pointsMaterial size={2.4} sizeAttenuation={false} vertexColors transparent opacity={0.9} />
    </points>
  );
}

function Planet() {
  const planet = useRef<THREE.Mesh>(null);
  const ring = useRef<THREE.Mesh>(null);

  useFrame((_, delta) => {
    if (useSettingsStore.getState().reducedMotion) return;
    if (planet.current) planet.current.rotation.y += delta * 0.008;
    if (ring.current) ring.current.rotation.z += delta * 0.004;
  });

  return (
    <group position={[-420, -120, -640]}>
      <mesh ref={planet}>
        <sphereGeometry args={[190, 48, 32]} />
        <meshStandardMaterial
          color="#1d3b5c"
          emissive="#0d2136"
          emissiveIntensity={0.6}
          roughness={0.95}
          metalness={0}
        />
      </mesh>
      {/* Terminator glow along the lit limb. */}
      <mesh scale={1.06}>
        <sphereGeometry args={[190, 32, 24]} />
        <meshBasicMaterial color="#38bdf8" transparent opacity={0.06} side={THREE.BackSide} />
      </mesh>
      <mesh ref={ring} rotation={[Math.PI / 2.4, 0, 0.3]}>
        <ringGeometry args={[240, 330, 96]} />
        <meshBasicMaterial color="#4c6f96" transparent opacity={0.22} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

/**
 * Traffic: hulls on slow circular approaches, each with a running light.
 *
 * Movement outside the windows is what stops the station reading as a diorama.
 */
function Traffic({ count }: { count: number }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const lights = useRef<THREE.InstancedMesh>(null);

  const orbits = useMemo(() => {
    const rng = createRng(0x7a4f1);
    return Array.from({ length: count }, () => ({
      radius: 220 + rng.next() * 380,
      height: -80 + rng.next() * 200,
      speed: (rng.next() > 0.5 ? 1 : -1) * (0.02 + rng.next() * 0.05),
      offset: rng.next() * Math.PI * 2,
      tilt: (rng.next() - 0.5) * 0.6,
      scale: 1.6 + rng.next() * 3.4,
    }));
  }, [count]);

  const matrix = useMemo(() => new THREE.Matrix4(), []);
  const quaternion = useMemo(() => new THREE.Quaternion(), []);
  const position = useMemo(() => new THREE.Vector3(), []);
  const scale = useMemo(() => new THREE.Vector3(), []);
  const euler = useMemo(() => new THREE.Euler(), []);

  useLayoutEffect(() => {
    mesh.current?.computeBoundingSphere();
  }, []);

  useFrame((state) => {
    const hulls = mesh.current;
    const running = lights.current;
    if (!hulls) return;
    const time = useSettingsStore.getState().reducedMotion ? 0 : state.clock.elapsedTime;

    orbits.forEach((orbit, index) => {
      const angle = orbit.offset + time * orbit.speed;
      position.set(
        Math.cos(angle) * orbit.radius,
        orbit.height + Math.sin(angle * 2) * 18,
        Math.sin(angle) * orbit.radius - 120,
      );
      euler.set(orbit.tilt, -angle + Math.PI / 2, 0);
      quaternion.setFromEuler(euler);
      scale.set(orbit.scale, orbit.scale * 0.4, orbit.scale * 2.2);
      matrix.compose(position, quaternion, scale);
      hulls.setMatrixAt(index, matrix);

      if (running) {
        scale.set(orbit.scale * 0.4, orbit.scale * 0.4, orbit.scale * 0.4);
        matrix.compose(position, quaternion, scale);
        running.setMatrixAt(index, matrix);
      }
    });

    hulls.instanceMatrix.needsUpdate = true;
    if (running) running.instanceMatrix.needsUpdate = true;
  });

  return (
    <group>
      <instancedMesh ref={mesh} args={[undefined, undefined, count]} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#63748c" metalness={0.8} roughness={0.4} />
      </instancedMesh>
      <instancedMesh ref={lights} args={[undefined, undefined, count]} frustumCulled={false}>
        <sphereGeometry args={[1, 6, 4]} />
        <meshBasicMaterial color="#7dd3fc" />
      </instancedMesh>
    </group>
  );
}

/** Two enormous translucent shells giving the sky depth and colour. */
function Nebula() {
  return (
    <group>
      <mesh position={[500, 200, -700]} rotation={[0.4, 0.8, 0]}>
        <sphereGeometry args={[420, 20, 14]} />
        <meshBasicMaterial color="#3b1d5c" transparent opacity={0.07} side={THREE.BackSide} />
      </mesh>
      <mesh position={[-300, -260, 620]} rotation={[0.2, -0.6, 0.3]}>
        <sphereGeometry args={[380, 20, 14]} />
        <meshBasicMaterial color="#0e4a5c" transparent opacity={0.06} side={THREE.BackSide} />
      </mesh>
    </group>
  );
}
