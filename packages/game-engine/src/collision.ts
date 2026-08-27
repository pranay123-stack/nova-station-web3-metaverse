import type { StationGeometry, StationSolid, WalkSurface } from '@nova/game-data';
import { clamp } from './math.js';

/**
 * Broad-phase spatial hash over the XZ plane.
 *
 * The station has a few hundred boxes; a uniform grid keeps every movement
 * query to a handful of candidates, which matters because the server runs this
 * for every connected player on every validated move.
 */
const CELL = 8;

function cellKey(cx: number, cz: number): number {
  // Pack two signed 16-bit cell coordinates into one integer key.
  return ((cx + 4096) << 13) | (cz + 4096);
}

export interface CollisionWorld {
  readonly solids: readonly StationSolid[];
  readonly surfaces: readonly WalkSurface[];
  readonly bounds: StationGeometry['bounds'];
  solidsNear(minX: number, minZ: number, maxX: number, maxZ: number): readonly StationSolid[];
  surfacesNear(x: number, z: number): readonly WalkSurface[];
}

function buildGrid<T>(
  items: readonly T[],
  rect: (item: T) => readonly [number, number, number, number],
): Map<number, T[]> {
  const grid = new Map<number, T[]>();
  for (const item of items) {
    const [minX, minZ, maxX, maxZ] = rect(item);
    const cx0 = Math.floor(minX / CELL);
    const cx1 = Math.floor(maxX / CELL);
    const cz0 = Math.floor(minZ / CELL);
    const cz1 = Math.floor(maxZ / CELL);
    for (let cx = cx0; cx <= cx1; cx += 1) {
      for (let cz = cz0; cz <= cz1; cz += 1) {
        const key = cellKey(cx, cz);
        const bucket = grid.get(key);
        if (bucket) bucket.push(item);
        else grid.set(key, [item]);
      }
    }
  }
  return grid;
}

export function createCollisionWorld(geometry: StationGeometry): CollisionWorld {
  const solidGrid = buildGrid(geometry.solids, (s) => [s.min[0], s.min[2], s.max[0], s.max[2]]);
  const surfaceGrid = buildGrid(geometry.surfaces, (s) => [s.min[0], s.min[1], s.max[0], s.max[1]]);

  return {
    solids: geometry.solids,
    surfaces: geometry.surfaces,
    bounds: geometry.bounds,
    solidsNear(minX, minZ, maxX, maxZ) {
      const out: StationSolid[] = [];
      const seen = new Set<StationSolid>();
      const cx0 = Math.floor(minX / CELL);
      const cx1 = Math.floor(maxX / CELL);
      const cz0 = Math.floor(minZ / CELL);
      const cz1 = Math.floor(maxZ / CELL);
      for (let cx = cx0; cx <= cx1; cx += 1) {
        for (let cz = cz0; cz <= cz1; cz += 1) {
          const bucket = solidGrid.get(cellKey(cx, cz));
          if (!bucket) continue;
          for (const s of bucket) {
            if (!seen.has(s)) {
              seen.add(s);
              out.push(s);
            }
          }
        }
      }
      return out;
    },
    surfacesNear(x, z) {
      return surfaceGrid.get(cellKey(Math.floor(x / CELL), Math.floor(z / CELL))) ?? [];
    },
  };
}

/** Height of a walkable surface at (x, z), or null when the point is off it. */
export function surfaceHeightAt(surface: WalkSurface, x: number, z: number): number | null {
  const [minX, minZ] = surface.min;
  const [maxX, maxZ] = surface.max;
  if (x < minX || x > maxX || z < minZ || z > maxZ) return null;
  if (surface.kind === 'floor') return surface.y;
  const along = surface.axis === 'x' ? x : z;
  const lo = surface.axis === 'x' ? minX : minZ;
  const hi = surface.axis === 'x' ? maxX : maxZ;
  const t = hi === lo ? 0 : (along - lo) / (hi - lo);
  return surface.yStart + (surface.yEnd - surface.yStart) * t;
}

export interface GroundQuery {
  /** Height of the ground the character would stand on, or null when there is none. */
  readonly y: number | null;
  /** The surface tag, useful for footstep sounds and debugging. */
  readonly tag: string | null;
}

/**
 * Finds the highest walkable height at (x, z) that the feet at `feetY` could
 * reasonably be standing on: anything from `feetY + stepHeight` downwards.
 * Solid box tops count as ground, so crates and platforms are walkable.
 */
export function groundAt(
  world: CollisionWorld,
  x: number,
  z: number,
  feetY: number,
  stepHeight: number,
): GroundQuery {
  const ceiling = feetY + stepHeight;
  let best: number | null = null;
  let tag: string | null = null;

  for (const surface of world.surfacesNear(x, z)) {
    const h = surfaceHeightAt(surface, x, z);
    if (h === null || h > ceiling) continue;
    if (best === null || h > best) {
      best = h;
      tag = surface.tag;
    }
  }
  for (const solid of world.solidsNear(x, z, x, z)) {
    if (x < solid.min[0] || x > solid.max[0] || z < solid.min[2] || z > solid.max[2]) continue;
    const top = solid.max[1];
    if (top > ceiling) continue;
    if (best === null || top > best) {
      best = top;
      tag = solid.tag;
    }
  }
  return { y: best, tag };
}

/** True when a vertical cylinder at (x, z) overlaps a solid between the given heights. */
export function overlapsSolid(
  world: CollisionWorld,
  x: number,
  z: number,
  radius: number,
  bottomY: number,
  topY: number,
): boolean {
  const candidates = world.solidsNear(x - radius, z - radius, x + radius, z + radius);
  for (const solid of candidates) {
    if (solid.max[1] <= bottomY || solid.min[1] >= topY) continue;
    const nx = clamp(x, solid.min[0], solid.max[0]);
    const nz = clamp(z, solid.min[2], solid.max[2]);
    const dx = x - nx;
    const dz = z - nz;
    if (dx * dx + dz * dz < radius * radius) return true;
  }
  return false;
}

/**
 * Sweeps a circle along one horizontal axis and stops it at the first solid in
 * the way.
 *
 * This is an exact swept test rather than a test of the destination point, so a
 * large step — a lag spike, a slow frame, a server replaying a batch of inputs
 * — cannot tunnel through a wall. Axis-separated resolution also keeps the
 * character from catching on corners.
 */
export function sweepAxis(
  world: CollisionWorld,
  x: number,
  z: number,
  axis: 'x' | 'z',
  delta: number,
  radius: number,
  bottomY: number,
  topY: number,
): { value: number; hit: boolean } {
  const from = axis === 'x' ? x : z;
  if (delta === 0) return { value: from, hit: false };

  let target = from + delta;
  let hit = false;

  const minX = Math.min(x, axis === 'x' ? target : x) - radius;
  const maxX = Math.max(x, axis === 'x' ? target : x) + radius;
  const minZ = Math.min(z, axis === 'z' ? target : z) - radius;
  const maxZ = Math.max(z, axis === 'z' ? target : z) + radius;

  for (const solid of world.solidsNear(minX, minZ, maxX, maxZ)) {
    if (solid.max[1] <= bottomY || solid.min[1] >= topY) continue;

    // The stationary axis must overlap the box for the sweep to touch it.
    const otherPos = axis === 'x' ? z : x;
    const otherMin = axis === 'x' ? solid.min[2] : solid.min[0];
    const otherMax = axis === 'x' ? solid.max[2] : solid.max[0];
    if (otherPos + radius <= otherMin || otherPos - radius >= otherMax) continue;

    const boxMin = axis === 'x' ? solid.min[0] : solid.min[2];
    const boxMax = axis === 'x' ? solid.max[0] : solid.max[2];

    if (delta > 0) {
      const plane = boxMin - radius;
      if (from <= plane && target > plane) {
        target = plane;
        hit = true;
      }
    } else {
      const plane = boxMax + radius;
      if (from >= plane && target < plane) {
        target = plane;
        hit = true;
      }
    }
  }
  return { value: target, hit };
}

/**
 * Pushes a character that has ended up inside geometry back out along the axis
 * of least penetration. Runs after teleports and on server-side corrections.
 */
export function resolvePenetration(
  world: CollisionWorld,
  x: number,
  z: number,
  radius: number,
  bottomY: number,
  topY: number,
): { x: number; z: number; moved: boolean } {
  let outX = x;
  let outZ = z;
  let moved = false;
  for (let pass = 0; pass < 4; pass += 1) {
    let adjusted = false;
    for (const solid of world.solidsNear(outX - radius, outZ - radius, outX + radius, outZ + radius)) {
      if (solid.max[1] <= bottomY || solid.min[1] >= topY) continue;
      const nx = clamp(outX, solid.min[0], solid.max[0]);
      const nz = clamp(outZ, solid.min[2], solid.max[2]);
      const dx = outX - nx;
      const dz = outZ - nz;
      const distSq = dx * dx + dz * dz;
      if (distSq >= radius * radius) continue;

      const left = outX - (solid.min[0] - radius);
      const right = solid.max[0] + radius - outX;
      const back = outZ - (solid.min[2] - radius);
      const front = solid.max[2] + radius - outZ;
      const min = Math.min(left, right, back, front);
      if (min === left) outX = solid.min[0] - radius;
      else if (min === right) outX = solid.max[0] + radius;
      else if (min === back) outZ = solid.min[2] - radius;
      else outZ = solid.max[2] + radius;
      adjusted = true;
      moved = true;
    }
    if (!adjusted) break;
  }
  return { x: outX, z: outZ, moved };
}
