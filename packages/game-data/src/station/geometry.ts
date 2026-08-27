import type {
  StationAreaId,
  StationGeometry,
  StationSolid,
  Vec2,
  Vec3,
  WalkSurface,
} from '../types.js';
import { CORRIDORS, STATION_AREAS, STATION_AREA_IDS } from './areas.js';
import { STATION_PROPS } from './props.js';

const WALL_THICKNESS = 1.2;

/** Surface materials shared by the renderer and the debug collision view. */
export const MATERIALS = {
  wall: { color: '#2a3340', metalness: 0.55, roughness: 0.55 },
  wallAccent: { color: '#38455a', metalness: 0.7, roughness: 0.35 },
  pillar: { color: '#1f2733', metalness: 0.8, roughness: 0.3 },
  glass: { color: '#0b2233', metalness: 0.2, roughness: 0.08 },
  field: { color: '#22d3ee', metalness: 0.1, roughness: 0.4 },
} as const;

interface Gap {
  readonly from: number;
  readonly to: number;
}

/**
 * Emits the solid segments of one straight wall, skipping the doorway gaps.
 *
 * `along` is the axis the wall runs along; `fixed` is its position on the other
 * horizontal axis. Segments shorter than 0.2m are dropped so that a doorway
 * flush with a corner does not leave a sliver.
 */
function wallSegments(
  along: 'x' | 'z',
  fixed: number,
  from: number,
  to: number,
  gaps: readonly Gap[],
  baseY: number,
  height: number,
  tag: string,
  group: string,
  color: string,
): StationSolid[] {
  const sorted = [...gaps].sort((a, b) => a.from - b.from);
  const out: StationSolid[] = [];
  let cursor = from;

  const push = (a: number, b: number, index: number): void => {
    if (b - a < 0.2) return;
    const min: Vec3 =
      along === 'x'
        ? [a, baseY, fixed - WALL_THICKNESS / 2]
        : [fixed - WALL_THICKNESS / 2, baseY, a];
    const max: Vec3 =
      along === 'x'
        ? [b, baseY + height, fixed + WALL_THICKNESS / 2]
        : [fixed + WALL_THICKNESS / 2, baseY + height, b];
    out.push({
      kind: 'box',
      min,
      max,
      tag: `${tag}#${index}`,
      group,
      color,
      metalness: MATERIALS.wall.metalness,
      roughness: MATERIALS.wall.roughness,
    });
  };

  for (const gap of sorted) {
    push(cursor, Math.min(gap.from, to), out.length);
    cursor = Math.max(cursor, gap.to);
  }
  push(cursor, to, out.length);
  return out;
}

interface RoomWallPlan {
  readonly area: StationAreaId;
  readonly north: readonly Gap[];
  readonly south: readonly Gap[];
  readonly west: readonly Gap[];
  readonly east: readonly Gap[];
}

/** Doorway plan per room, derived by hand from the corridor list. */
const ROOM_WALLS: readonly RoomWallPlan[] = [
  { area: 'habitat', north: [{ from: -4, to: 4 }], south: [{ from: -4, to: 4 }], west: [], east: [] },
  {
    area: 'market',
    north: [{ from: -4, to: 4 }],
    south: [{ from: -4, to: 4 }],
    west: [{ from: -74, to: -66 }],
    east: [{ from: -74, to: -66 }],
  },
  { area: 'hangar', north: [], south: [], west: [], east: [{ from: -74, to: -66 }] },
  { area: 'lab', north: [], south: [], west: [{ from: -74, to: -66 }], east: [] },
  { area: 'command_deck', north: [], south: [{ from: -4, to: 4 }], west: [], east: [] },
  {
    area: 'mining_bay',
    north: [{ from: -4, to: 4 }],
    south: [{ from: -4, to: 4 }],
    west: [],
    east: [],
  },
  { area: 'docking_bay', north: [{ from: -4, to: 4 }], south: [], west: [], east: [] },
];

function buildRoomSolids(): StationSolid[] {
  const out: StationSolid[] = [];
  for (const plan of ROOM_WALLS) {
    const area = STATION_AREAS[plan.area as Exclude<StationAreaId, 'corridor'>];
    const [cx, , cz] = area.center;
    const [hx, hz] = area.halfExtents;
    const minX = cx - hx;
    const maxX = cx + hx;
    const minZ = cz - hz;
    const maxZ = cz + hz;
    const y = area.floorY;
    const h = area.ceilingHeight;
    const color = MATERIALS.wall.color;

    // North wall sits at min Z, south wall at max Z (the map's north is -Z).
    out.push(
      ...wallSegments('x', minZ, minX, maxX, plan.north, y, h, `${plan.area}:wall:n`, 'wall', color),
      ...wallSegments('x', maxZ, minX, maxX, plan.south, y, h, `${plan.area}:wall:s`, 'wall', color),
      ...wallSegments('z', minX, minZ, maxZ, plan.west, y, h, `${plan.area}:wall:w`, 'wall', color),
      ...wallSegments('z', maxX, minZ, maxZ, plan.east, y, h, `${plan.area}:wall:e`, 'wall', color),
    );
  }
  return out;
}

function buildCorridorSolids(): StationSolid[] {
  const out: StationSolid[] = [];
  for (const c of CORRIDORS) {
    const [minX, minZ] = c.min;
    const [maxX, maxZ] = c.max;
    const baseY = Math.min(c.y ?? c.yStart ?? 0, c.y ?? c.yEnd ?? 0) - 1;
    const height = c.wallHeight;
    if (c.axis === 'z') {
      out.push(
        ...wallSegments('z', minX, minZ, maxZ, [], baseY, height, `${c.id}:wall:w`, 'wall', MATERIALS.wallAccent.color),
        ...wallSegments('z', maxX, minZ, maxZ, [], baseY, height, `${c.id}:wall:e`, 'wall', MATERIALS.wallAccent.color),
      );
    } else {
      out.push(
        ...wallSegments('x', minZ, minX, maxX, [], baseY, height, `${c.id}:wall:n`, 'wall', MATERIALS.wallAccent.color),
        ...wallSegments('x', maxZ, minX, maxX, [], baseY, height, `${c.id}:wall:s`, 'wall', MATERIALS.wallAccent.color),
      );
    }
  }
  return out;
}

function buildSurfaces(): WalkSurface[] {
  const out: WalkSurface[] = [];
  for (const id of STATION_AREA_IDS) {
    const area = STATION_AREAS[id as Exclude<StationAreaId, 'corridor'>];
    const [cx, , cz] = area.center;
    const [hx, hz] = area.halfExtents;
    out.push({
      kind: 'floor',
      min: [cx - hx, cz - hz] as Vec2,
      max: [cx + hx, cz + hz] as Vec2,
      y: area.floorY,
      area: id,
      tag: `${id}:floor`,
    });
  }
  for (const c of CORRIDORS) {
    if (c.y !== undefined) {
      out.push({
        kind: 'floor',
        min: c.min,
        max: c.max,
        y: c.y,
        area: 'corridor',
        tag: `${c.id}:floor`,
      });
    } else {
      out.push({
        kind: 'ramp',
        min: c.min,
        max: c.max,
        axis: c.axis,
        yStart: c.yStart ?? 0,
        yEnd: c.yEnd ?? 0,
        area: 'corridor',
        tag: `${c.id}:ramp`,
      });
    }
  }
  return out;
}

function computeBounds(solids: readonly StationSolid[], surfaces: readonly WalkSurface[]) {
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (const s of solids) {
    minX = Math.min(minX, s.min[0]);
    minY = Math.min(minY, s.min[1]);
    minZ = Math.min(minZ, s.min[2]);
    maxX = Math.max(maxX, s.max[0]);
    maxY = Math.max(maxY, s.max[1]);
    maxZ = Math.max(maxZ, s.max[2]);
  }
  for (const s of surfaces) {
    minX = Math.min(minX, s.min[0]);
    minZ = Math.min(minZ, s.min[1]);
    maxX = Math.max(maxX, s.max[0]);
    maxZ = Math.max(maxZ, s.max[1]);
    const ys = s.kind === 'floor' ? [s.y] : [s.yStart, s.yEnd];
    for (const y of ys) {
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  }
  return { min: [minX, minY, minZ] as Vec3, max: [maxX, maxY, maxZ] as Vec3 };
}

let cached: StationGeometry | null = null;

/**
 * Builds the station once and memoises it. Client and server call this and get
 * byte-identical geometry, which is what lets the server validate movement
 * against exactly the walls the player can see.
 */
export function getStationGeometry(): StationGeometry {
  if (cached) return cached;
  const solids: StationSolid[] = [
    ...buildRoomSolids(),
    ...buildCorridorSolids(),
    ...STATION_PROPS.filter((p) => p.solid).map((p) => p.box),
  ];
  const surfaces = buildSurfaces();
  cached = { solids, surfaces, bounds: computeBounds(solids, surfaces) };
  return cached;
}

/** Test hook: forget the memoised geometry. */
export function resetStationGeometry(): void {
  cached = null;
}
