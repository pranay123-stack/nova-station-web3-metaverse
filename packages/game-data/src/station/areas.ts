import type { StationAreaDef, StationAreaId, Vec2, Vec3 } from '../types.js';

/**
 * NOVA STATION is laid out on a single navigable plane so that the character
 * controller never needs lifts or portals: a central Habitat hub with a
 * north spine (Market → Command Deck), east/west wings (Hangar, Lab) and a
 * south spine (Mining Bay → Docking Bay). Height changes happen on walkable
 * ramps, which the controller supports natively.
 *
 *                          COMMAND DECK        z = -140 (raised +7m)
 *                                |
 *        HANGAR  ——————————  MARKET  ——————————  LAB      z = -70
 *                                |
 *                            HABITAT             z = 0   (spawn)
 *                                |
 *                          MINING BAY            z = +70
 *                                |
 *                          DOCKING BAY           z = +140 (lowered -4m)
 */
export const STATION_AREAS: Readonly<Record<Exclude<StationAreaId, 'corridor'>, StationAreaDef>> = {
  habitat: {
    id: 'habitat',
    name: 'Habitats',
    description:
      'The station’s living ring. Bunk stacks, a noodle counter that never closes, and the only place on Nova where nobody is trying to sell you anything.',
    center: [0, 0, 0],
    halfExtents: [24, 24],
    floorY: 0,
    ceilingHeight: 14,
    accentColor: '#5eead4',
    ambientColor: '#0d2b2b',
    requiredLevel: 0,
    icon: '🏠',
  },
  market: {
    id: 'market',
    name: 'Marketplace',
    description:
      'Four trading rows under a holo-canopy. Station brokers on one side, the open exchange on the other, and a Syndicate booth nobody officially licenses.',
    center: [0, 0, -70],
    halfExtents: [22, 20],
    floorY: 0,
    ceilingHeight: 12,
    accentColor: '#fbbf24',
    ambientColor: '#2b1f08',
    requiredLevel: 0,
    icon: '🏪',
  },
  hangar: {
    id: 'hangar',
    name: 'Hangar',
    description:
      'Six berths, four gantries and a permanent smell of coolant. Every hull on the registry passes through here eventually.',
    center: [-80, 0, -70],
    halfExtents: [30, 24],
    floorY: 0,
    ceilingHeight: 20,
    accentColor: '#38bdf8',
    ambientColor: '#0a1c2b',
    requiredLevel: 0,
    icon: '🛠️',
  },
  lab: {
    id: 'lab',
    name: 'Laboratory',
    description:
      'Federation research wing. Fabrication benches on the floor, a containment column in the middle, and a great deal of paperwork on the walls.',
    center: [80, 0, -70],
    halfExtents: [22, 20],
    floorY: 0,
    ceilingHeight: 12,
    accentColor: '#a78bfa',
    ambientColor: '#1a1030',
    requiredLevel: 4,
    icon: '🧪',
  },
  command_deck: {
    id: 'command_deck',
    name: 'Command Deck',
    description:
      'The station’s bridge, cantilevered over the north face. A live holo-model of Nova turns in the middle of the floor.',
    center: [0, 7, -140],
    halfExtents: [24, 18],
    floorY: 7,
    ceilingHeight: 14,
    accentColor: '#60a5fa',
    ambientColor: '#0b1730',
    requiredLevel: 6,
    icon: '🛰️',
  },
  mining_bay: {
    id: 'mining_bay',
    name: 'Mining Bay',
    description:
      'Ore comes in raw, leaves as credits. Crushers along the west wall, the assay line along the east, and a permanent haze of rock dust.',
    center: [0, 0, 70],
    halfExtents: [24, 20],
    floorY: 0,
    ceilingHeight: 16,
    accentColor: '#f97316',
    ambientColor: '#2b1206',
    requiredLevel: 0,
    icon: '⛏️',
  },
  docking_bay: {
    id: 'docking_bay',
    name: 'Docking Bay',
    description:
      'The open mouth of the station. Beyond the containment field there is nothing but the belt and whatever you are brave enough to fly to.',
    center: [0, -4, 140],
    halfExtents: [28, 24],
    floorY: -4,
    ceilingHeight: 22,
    accentColor: '#22d3ee',
    ambientColor: '#04222b',
    requiredLevel: 2,
    icon: '🚀',
  },
};

export const STATION_AREA_IDS: readonly StationAreaId[] = [
  'habitat',
  'market',
  'hangar',
  'lab',
  'command_deck',
  'mining_bay',
  'docking_bay',
];

/** Where a player materialises when they first enter the station. */
export const SPAWN_POINT: Vec3 = [0, 0, 14];
/** Facing the habitat ring, so the first thing a new arrival sees is the hub. */
export const SPAWN_YAW = 0;

/** Per-area arrival points used by the station map's "navigate here" action. */
export const AREA_ANCHORS: Readonly<Record<Exclude<StationAreaId, 'corridor'>, Vec3>> = {
  habitat: [0, 0, 14],
  market: [0, 0, -58],
  hangar: [-58, 0, -70],
  lab: [66, 0, -70],
  command_deck: [0, 7, -128],
  mining_bay: [0, 0, 58],
  docking_bay: [0, -4, 124],
};

export interface CorridorSpec {
  readonly id: string;
  /** Long axis of the corridor. */
  readonly axis: 'x' | 'z';
  /** Rect on the floor plane. */
  readonly min: Vec2;
  readonly max: Vec2;
  /** Flat corridors set `y`; ramps set `yStart`/`yEnd` along `axis`. */
  readonly y?: number;
  readonly yStart?: number;
  readonly yEnd?: number;
  readonly wallHeight: number;
  readonly connects: readonly [StationAreaId, StationAreaId];
}

export const CORRIDORS: readonly CorridorSpec[] = [
  {
    id: 'hub_market',
    axis: 'z',
    min: [-4, -50],
    max: [4, -24],
    y: 0,
    wallHeight: 9,
    connects: ['habitat', 'market'],
  },
  {
    id: 'market_hangar',
    axis: 'x',
    min: [-50, -74],
    max: [-22, -66],
    y: 0,
    wallHeight: 9,
    connects: ['market', 'hangar'],
  },
  {
    id: 'market_lab',
    axis: 'x',
    min: [22, -74],
    max: [50, -66],
    y: 0,
    wallHeight: 9,
    connects: ['market', 'lab'],
  },
  {
    id: 'market_command',
    axis: 'z',
    min: [-4, -122],
    max: [4, -90],
    yStart: 7,
    yEnd: 0,
    wallHeight: 16,
    connects: ['market', 'command_deck'],
  },
  {
    id: 'hub_mining',
    axis: 'z',
    min: [-4, 24],
    max: [4, 50],
    y: 0,
    wallHeight: 9,
    connects: ['habitat', 'mining_bay'],
  },
  {
    id: 'mining_docking',
    axis: 'z',
    min: [-4, 90],
    max: [4, 116],
    yStart: 0,
    yEnd: -4,
    wallHeight: 14,
    connects: ['mining_bay', 'docking_bay'],
  },
];

/** Adjacency used by the station map for path hints. */
export const AREA_GRAPH: Readonly<Record<StationAreaId, readonly StationAreaId[]>> = {
  habitat: ['market', 'mining_bay'],
  market: ['habitat', 'hangar', 'lab', 'command_deck'],
  hangar: ['market'],
  lab: ['market'],
  command_deck: ['market'],
  mining_bay: ['habitat', 'docking_bay'],
  docking_bay: ['mining_bay'],
  corridor: [],
};

/** Returns the area whose rectangle contains the point, or 'corridor'. */
export function areaAtPosition(x: number, z: number): StationAreaId {
  for (const id of STATION_AREA_IDS) {
    const area = STATION_AREAS[id as Exclude<StationAreaId, 'corridor'>];
    const [cx, , cz] = area.center;
    const [hx, hz] = area.halfExtents;
    if (x >= cx - hx && x <= cx + hx && z >= cz - hz && z <= cz + hz) return id;
  }
  return 'corridor';
}
