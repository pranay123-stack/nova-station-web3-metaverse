'use client';

import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { STATION_AREAS, STATION_AREA_IDS, getStationGeometry, type StationAreaId } from '@nova/game-data';

/**
 * The station shell.
 *
 * Every wall, pillar and crate is a box, and boxes that share a material are
 * drawn as a single `InstancedMesh`. The whole station — several hundred
 * solids — costs roughly a dozen draw calls, which is what makes 60fps
 * achievable on integrated graphics rather than a stretch goal.
 *
 * Crucially, this reads the same `getStationGeometry()` the collision system
 * and the server read. There is no separate "visual" station that could drift
 * out of step with the one you can actually walk into.
 */
export function Station() {
  const geometry = useMemo(() => getStationGeometry(), []);

  // Group solids by their material so each group becomes one instanced draw.
  const groups = useMemo(() => {
    const map = new Map<
      string,
      {
        color: string;
        metalness: number;
        roughness: number;
        emissive: string | undefined;
        emissiveIntensity: number;
        boxes: typeof geometry.solids;
      }
    >();

    for (const solid of geometry.solids) {
      const key = `${solid.color}|${solid.metalness}|${solid.roughness}|${solid.emissive ?? ''}|${solid.emissiveIntensity ?? 0}`;
      const existing = map.get(key);
      if (existing) {
        existing.boxes = [...existing.boxes, solid];
      } else {
        map.set(key, {
          color: solid.color,
          metalness: solid.metalness,
          roughness: solid.roughness,
          emissive: solid.emissive,
          emissiveIntensity: solid.emissiveIntensity ?? 0,
          boxes: [solid],
        });
      }
    }
    return [...map.entries()].map(([key, value]) => ({ key, ...value }));
  }, [geometry]);

  return (
    <group name="station">
      {groups.map(({ key, ...group }) => (
        <SolidGroup key={key} {...group} />
      ))}
      <Floors />
      <Ceilings />
    </group>
  );
}

interface SolidGroupProps {
  readonly color: string;
  readonly metalness: number;
  readonly roughness: number;
  readonly emissive: string | undefined;
  readonly emissiveIntensity: number;
  readonly boxes: ReturnType<typeof getStationGeometry>['solids'];
}

function SolidGroup({ color, metalness, roughness, emissive, emissiveIntensity, boxes }: SolidGroupProps) {
  const mesh = useRef<THREE.InstancedMesh>(null);

  useLayoutEffect(() => {
    const instanced = mesh.current;
    if (!instanced) return;
    const matrix = new THREE.Matrix4();

    boxes.forEach((box, index) => {
      const sx = box.max[0] - box.min[0];
      const sy = box.max[1] - box.min[1];
      const sz = box.max[2] - box.min[2];
      matrix.compose(
        new THREE.Vector3(
          (box.min[0] + box.max[0]) / 2,
          (box.min[1] + box.max[1]) / 2,
          (box.min[2] + box.max[2]) / 2,
        ),
        new THREE.Quaternion(),
        new THREE.Vector3(sx, sy, sz),
      );
      instanced.setMatrixAt(index, matrix);
    });

    instanced.instanceMatrix.needsUpdate = true;
    instanced.computeBoundingSphere();
  }, [boxes]);

  return (
    <instancedMesh
      ref={mesh}
      args={[undefined, undefined, boxes.length]}
      castShadow={false}
      receiveShadow={false}
      frustumCulled
    >
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial
        color={color}
        metalness={metalness}
        roughness={roughness}
        {...(emissive ? { emissive, emissiveIntensity } : {})}
      />
    </instancedMesh>
  );
}

/**
 * Floors carry the area's accent colour as a faint emissive wash, which is what
 * tells a player which sector they are standing in without reading the HUD.
 */
function Floors() {
  const geometry = useMemo(() => getStationGeometry(), []);

  return (
    <group name="floors">
      {geometry.surfaces.map((surface) => {
        const width = surface.max[0] - surface.min[0];
        const depth = surface.max[1] - surface.min[1];
        const cx = (surface.min[0] + surface.max[0]) / 2;
        const cz = (surface.min[1] + surface.max[1]) / 2;
        const accent =
          surface.area === 'corridor'
            ? '#243244'
            : STATION_AREAS[surface.area as Exclude<StationAreaId, 'corridor'>].ambientColor;

        if (surface.kind === 'floor') {
          return (
            <mesh
              key={surface.tag}
              position={[cx, surface.y, cz]}
              rotation={[-Math.PI / 2, 0, 0]}
              receiveShadow={false}
            >
              <planeGeometry args={[width, depth]} />
              <meshStandardMaterial
                color="#161f2b"
                emissive={accent}
                emissiveIntensity={0.55}
                metalness={0.35}
                roughness={0.75}
              />
            </mesh>
          );
        }

        // A ramp is a plane tilted to match the slope it represents.
        const rise = surface.yEnd - surface.yStart;
        const run = surface.axis === 'x' ? width : depth;
        const angle = Math.atan2(rise, run);
        const length = Math.hypot(run, rise);

        return (
          <mesh
            key={surface.tag}
            position={[cx, (surface.yStart + surface.yEnd) / 2, cz]}
            rotation={
              surface.axis === 'z'
                ? [-Math.PI / 2 + angle, 0, 0]
                : [-Math.PI / 2, 0, -angle]
            }
          >
            <planeGeometry
              args={surface.axis === 'z' ? [width, length] : [length, depth]}
            />
            <meshStandardMaterial
              color="#111a26"
              emissive="#1c2b3d"
              emissiveIntensity={0.4}
              metalness={0.4}
              roughness={0.7}
            />
          </mesh>
        );
      })}
    </group>
  );
}

/** Dark ceilings, so rooms feel enclosed without costing another light. */
function Ceilings() {
  return (
    <group name="ceilings">
      {STATION_AREA_IDS.map((id) => {
        if (id === 'corridor') return null;
        const area = STATION_AREAS[id as Exclude<StationAreaId, 'corridor'>];
        const [cx, , cz] = area.center;
        const [hx, hz] = area.halfExtents;
        return (
          <mesh
            key={id}
            position={[cx, area.floorY + area.ceilingHeight, cz]}
            rotation={[Math.PI / 2, 0, 0]}
          >
            <planeGeometry args={[hx * 2, hz * 2]} />
            {/* Double-sided so a camera that ends up above a room sees a roof
                rather than straight through into the interior. */}
            <meshStandardMaterial
              color="#080d14"
              metalness={0.5}
              roughness={0.9}
              side={THREE.DoubleSide}
            />
          </mesh>
        );
      })}
    </group>
  );
}
