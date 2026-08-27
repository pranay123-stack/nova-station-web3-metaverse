'use client';

import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Billboard, Text } from '@react-three/drei';
import { Bloom, EffectComposer, Vignette } from '@react-three/postprocessing';
import * as THREE from 'three';
import { MINING_ZONES_BY_ID, RESOURCES, type MiningZoneDef, type ResourceId } from '@nova/game-data';
import { createRng } from '@nova/game-engine';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { useMiningStore } from '@/stores/useMiningStore';
import { usePerformanceGovernor } from '@/game/systems/usePerformance';
import { flightParamsFor, useShipController } from '@/game/systems/useShipController';
import { ShipModel } from './ShipModel';
import { SpaceBackdrop } from './SpaceBackdrop';

/**
 * The mining scene.
 *
 * Asteroids are laid out from the expedition's `fieldSeed`, which the server
 * generated and handed over. Because the layout is deterministic, the client
 * and the server agree on which rock index 7 is — which is what lets the server
 * refuse a second extraction from the same node without ever seeing the field.
 *
 * The rocks themselves are one instanced mesh. Ore veins are a second instanced
 * mesh, coloured per resource, so a field of seventy asteroids is two draws.
 */
export interface AsteroidNode {
  readonly index: number;
  readonly position: THREE.Vector3;
  readonly radius: number;
  readonly resource: ResourceId;
  readonly rotation: THREE.Euler;
  readonly spin: number;
}

const INTERACT_RANGE = 14;

export function buildField(zone: MiningZoneDef, seed: number): AsteroidNode[] {
  const rng = createRng(seed);
  const nodes: AsteroidNode[] = [];
  const total = zone.table.reduce((sum, row) => sum + row.weight, 0);

  for (let index = 0; index < zone.asteroidCount; index += 1) {
    // Spherical shell distribution keeps the field around the player rather
    // than clumping it into a cube's corners.
    const u = rng.next() * 2 - 1;
    const theta = rng.next() * Math.PI * 2;
    const planar = Math.sqrt(Math.max(0, 1 - u * u));
    const distance = 30 + rng.next() * 190;

    let roll = rng.next() * total;
    let resource: ResourceId = zone.table[0]?.resource ?? 'iron';
    for (const row of zone.table) {
      roll -= row.weight;
      if (roll <= 0) {
        resource = row.resource;
        break;
      }
    }

    nodes.push({
      index,
      position: new THREE.Vector3(
        planar * Math.cos(theta) * distance,
        u * distance * 0.55,
        planar * Math.sin(theta) * distance,
      ),
      radius: 2.2 + rng.next() * 4.6,
      resource,
      rotation: new THREE.Euler(rng.next() * 6.28, rng.next() * 6.28, rng.next() * 6.28),
      spin: (rng.next() - 0.5) * 0.28,
    });
  }
  return nodes;
}

export function AsteroidFieldScene({
  zoneId,
  fieldSeed,
  shipDefId,
  shipSpeed,
  minedNodes,
  scannedNodes,
}: {
  zoneId: string;
  fieldSeed: number;
  shipDefId: string;
  shipSpeed: number;
  minedNodes: readonly number[];
  scannedNodes: readonly number[];
}) {
  usePerformanceGovernor();
  const quality = useSettingsStore((state) => state.quality);
  const zone = MINING_ZONES_BY_ID.get(zoneId);
  const params = useMemo(() => flightParamsFor(shipSpeed), [shipSpeed]);
  const ship = useShipController(params);

  const nodes = useMemo(
    () => (zone ? buildField(zone, fieldSeed) : []),
    [zone, fieldSeed],
  );

  const setTarget = useMiningStore((state) => state.setTarget);
  const lastTarget = useRef<number | null>(null);

  useFrame(() => {
    // The closest un-mined rock in range becomes the interaction target.
    let best: AsteroidNode | null = null;
    let bestDistance = INTERACT_RANGE;
    for (const node of nodes) {
      if (minedNodes.includes(node.index)) continue;
      const distance = ship.position.distanceTo(node.position) - node.radius;
      if (distance < bestDistance) {
        best = node;
        bestDistance = distance;
      }
    }
    const id = best?.index ?? null;
    if (id !== lastTarget.current) {
      lastTarget.current = id;
      setTarget(
        best
          ? { index: best.index, resource: best.resource, distance: Math.max(0, bestDistance) }
          : null,
      );
    }
  });

  if (!zone) return null;

  return (
    <>
      <ambientLight intensity={0.34} color={zone.palette.star} />
      <directionalLight position={[120, 180, -90]} intensity={1.1} color="#ffffff" />
      <pointLight position={[0, 0, 0]} intensity={40} distance={220} color={zone.palette.star} />
      <fog attach="fog" args={[zone.palette.fog, 90, 420]} />
      <color attach="background" args={[zone.palette.fog]} />

      <SpaceBackdrop />
      <Asteroids nodes={nodes} palette={zone.palette.rock} minedNodes={minedNodes} />
      <OreVeins nodes={nodes} minedNodes={minedNodes} />
      <NodeMarkers nodes={nodes} minedNodes={minedNodes} scannedNodes={scannedNodes} shipPosition={ship.position} />

      <group ref={ship.group}>
        <ShipModel defId={shipDefId} scale={1} thrust={ship.throttle.value} />
        <MiningBeam shipPosition={ship.position} nodes={nodes} />
      </group>

      {quality !== 'low' && (
        <EffectComposer enableNormalPass={false}>
          <Bloom intensity={1.1} luminanceThreshold={0.55} luminanceSmoothing={0.3} mipmapBlur />
          <Vignette offset={0.28} darkness={0.8} />
        </EffectComposer>
      )}
    </>
  );
}

function Asteroids({
  nodes,
  palette,
  minedNodes,
}: {
  nodes: readonly AsteroidNode[];
  palette: string;
  minedNodes: readonly number[];
}) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const matrix = useMemo(() => new THREE.Matrix4(), []);
  const quaternion = useMemo(() => new THREE.Quaternion(), []);
  const scale = useMemo(() => new THREE.Vector3(), []);
  const euler = useMemo(() => new THREE.Euler(), []);
  const spun = useRef(0);

  useLayoutEffect(() => {
    const instanced = mesh.current;
    if (!instanced) return;
    nodes.forEach((node, index) => {
      quaternion.setFromEuler(node.rotation);
      const worked = minedNodes.includes(node.index);
      scale.setScalar(worked ? node.radius * 0.72 : node.radius);
      matrix.compose(node.position, quaternion, scale);
      instanced.setMatrixAt(index, matrix);
    });
    instanced.instanceMatrix.needsUpdate = true;
    instanced.computeBoundingSphere();
  }, [nodes, minedNodes, matrix, quaternion, scale]);

  useFrame((_, delta) => {
    const instanced = mesh.current;
    if (!instanced || useSettingsStore.getState().reducedMotion) return;
    spun.current += delta;
    // Re-composing every rock each frame is wasteful; a slow pass keeps the
    // field alive at a fraction of the cost.
    if (spun.current < 0.1) return;
    const elapsed = spun.current;
    spun.current = 0;

    nodes.forEach((node, index) => {
      euler.set(
        node.rotation.x,
        node.rotation.y + node.spin * elapsed * 4,
        node.rotation.z,
      );
      node.rotation.copy(euler);
      quaternion.setFromEuler(euler);
      scale.setScalar(minedNodes.includes(node.index) ? node.radius * 0.72 : node.radius);
      matrix.compose(node.position, quaternion, scale);
      instanced.setMatrixAt(index, matrix);
    });
    instanced.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, Math.max(1, nodes.length)]}>
      <icosahedronGeometry args={[1, 1]} />
      <meshStandardMaterial color={palette} roughness={0.95} metalness={0.06} flatShading />
    </instancedMesh>
  );
}

/** Glowing veins, coloured by what the rock actually contains. */
function OreVeins({
  nodes,
  minedNodes,
}: {
  nodes: readonly AsteroidNode[];
  minedNodes: readonly number[];
}) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const matrix = useMemo(() => new THREE.Matrix4(), []);
  const color = useMemo(() => new THREE.Color(), []);

  useLayoutEffect(() => {
    const instanced = mesh.current;
    if (!instanced) return;
    nodes.forEach((node, index) => {
      const worked = minedNodes.includes(node.index);
      matrix.compose(
        node.position,
        new THREE.Quaternion().setFromEuler(node.rotation),
        new THREE.Vector3().setScalar(worked ? 0.001 : node.radius * 1.04),
      );
      instanced.setMatrixAt(index, matrix);
      color.set(RESOURCES[node.resource].color);
      instanced.setColorAt(index, color);
    });
    instanced.instanceMatrix.needsUpdate = true;
    if (instanced.instanceColor) instanced.instanceColor.needsUpdate = true;
  }, [nodes, minedNodes, matrix, color]);

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, Math.max(1, nodes.length)]}>
      <icosahedronGeometry args={[1, 0]} />
      <meshBasicMaterial transparent opacity={0.22} wireframe />
    </instancedMesh>
  );
}

/** Labels the rock the ship is closest to, and marks the ones already worked. */
function NodeMarkers({
  nodes,
  minedNodes,
  scannedNodes,
  shipPosition,
}: {
  nodes: readonly AsteroidNode[];
  minedNodes: readonly number[];
  scannedNodes: readonly number[];
  shipPosition: THREE.Vector3;
}) {
  const [nearby, setNearby] = useState<AsteroidNode[]>([]);
  const timer = useRef(0);

  useFrame((_, delta) => {
    timer.current += delta;
    if (timer.current < 0.25) return;
    timer.current = 0;
    setNearby(
      nodes.filter((node) => shipPosition.distanceTo(node.position) < 60).slice(0, 12),
    );
  });

  return (
    <group>
      {nearby.map((node) => {
        const worked = minedNodes.includes(node.index);
        const scanned = scannedNodes.includes(node.index);
        const resource = RESOURCES[node.resource];
        return (
          <Billboard key={node.index} position={[node.position.x, node.position.y + node.radius + 2, node.position.z]}>
            <Text
              fontSize={0.9}
              color={worked ? '#475569' : resource.color}
              anchorX="center"
              anchorY="middle"
              outlineWidth={0.06}
              outlineColor="#020617"
            >
              {worked ? 'DEPLETED' : `${resource.name}${scanned ? ' ·logged' : ''}`}
            </Text>
          </Billboard>
        );
      })}
    </group>
  );
}

/** The extraction beam, drawn while a mining session is running. */
function MiningBeam({
  shipPosition,
  nodes,
}: {
  shipPosition: THREE.Vector3;
  nodes: readonly AsteroidNode[];
}) {
  const active = useMiningStore((state) => state.session);
  const beam = useRef<THREE.Mesh>(null);
  const target = active ? nodes.find((node) => node.index === active.nodeIndex) : undefined;

  const direction = useMemo(() => new THREE.Vector3(), []);
  const quaternion = useMemo(() => new THREE.Quaternion(), []);
  const up = useMemo(() => new THREE.Vector3(0, 1, 0), []);

  useFrame((state) => {
    const mesh = beam.current;
    if (!mesh || !target) return;

    // The beam lives in the ship's local space, so the target is expressed
    // relative to the hull. A cylinder points along +Y, so it is rotated from
    // that axis onto the direction of travel and scaled to reach.
    direction.copy(target.position).sub(shipPosition);
    const distance = direction.length();
    if (distance < 0.01) return;
    direction.normalize();

    quaternion.setFromUnitVectors(up, direction);
    mesh.quaternion.copy(quaternion);
    mesh.scale.set(1, distance, 1);
    mesh.position.copy(direction).multiplyScalar(distance / 2);

    const material = mesh.material as THREE.MeshBasicMaterial;
    material.opacity = 0.34 + Math.sin(state.clock.elapsedTime * 18) * 0.12;
  });

  if (!target) return null;

  return (
    <mesh ref={beam}>
      <cylinderGeometry args={[0.1, 0.42, 1, 8, 1, true]} />
      <meshBasicMaterial
        color={RESOURCES[target.resource].color}
        transparent
        opacity={0.4}
        side={THREE.DoubleSide}
        depthWrite={false}
      />
    </mesh>
  );
}
