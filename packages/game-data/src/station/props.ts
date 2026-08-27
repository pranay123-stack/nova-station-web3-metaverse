import type { StationAreaId, StationSolid, Vec3 } from '../types.js';

export interface StationProp {
  readonly id: string;
  readonly area: StationAreaId;
  /** Collision + render box. */
  readonly box: StationSolid;
  /** When false the prop is drawn but never blocks movement. */
  readonly solid: boolean;
}

export type DecorKind =
  | 'cylinder'
  | 'sphere'
  | 'torus'
  | 'cone'
  | 'ring'
  | 'panel'
  | 'holo'
  | 'window'
  | 'pipe';

export interface DecorItem {
  readonly id: string;
  readonly area: StationAreaId;
  readonly kind: DecorKind;
  readonly position: Vec3;
  readonly rotation: Vec3;
  readonly scale: Vec3;
  readonly color: string;
  readonly emissive?: string;
  readonly emissiveIntensity?: number;
  readonly opacity?: number;
  readonly metalness?: number;
  readonly roughness?: number;
  /** Renderer animation hint. */
  readonly spin?: number;
  readonly bob?: number;
}

export interface AreaLight {
  readonly id: string;
  readonly area: StationAreaId;
  readonly position: Vec3;
  readonly color: string;
  /**
   * Candela. three.js uses physically-based light units with quadratic decay,
   * so a lamp eight metres above a floor needs a value in the hundreds to light
   * it — not the tens that read as "reasonable" by eye.
   */
  readonly intensity: number;
  readonly distance: number;
}

function box(
  id: string,
  area: StationAreaId,
  center: Vec3,
  size: Vec3,
  color: string,
  opts: {
    solid?: boolean;
    emissive?: string;
    emissiveIntensity?: number;
    metalness?: number;
    roughness?: number;
    group?: string;
  } = {},
): StationProp {
  const [cx, cy, cz] = center;
  const [sx, sy, sz] = size;
  const solid: StationSolid = {
    kind: 'box',
    min: [cx - sx / 2, cy, cz - sz / 2],
    max: [cx + sx / 2, cy + sy, cz + sz / 2],
    tag: id,
    group: opts.group ?? 'prop',
    color,
    metalness: opts.metalness ?? 0.6,
    roughness: opts.roughness ?? 0.45,
    ...(opts.emissive ? { emissive: opts.emissive } : {}),
    ...(opts.emissiveIntensity !== undefined
      ? { emissiveIntensity: opts.emissiveIntensity }
      : {}),
  };
  return { id, area, box: solid, solid: opts.solid ?? true };
}

const props: StationProp[] = [];
const decor: DecorItem[] = [];
const lights: AreaLight[] = [];

/* ---------------------------------------------------------------- HABITAT */
// Central social ring: a raised planter with seating and a holo-fountain.
props.push(box('hab_ring_base', 'habitat', [0, 0, 0], [12, 0.4, 12], '#1c2a2a', { roughness: 0.7 }));
props.push(box('hab_ring_wall', 'habitat', [0, 0.4, 0], [8, 0.8, 8], '#25403c', { emissive: '#5eead4', emissiveIntensity: 0.35 }));
decor.push({
  id: 'hab_fountain',
  area: 'habitat',
  kind: 'holo',
  position: [0, 2.2, 0],
  rotation: [0, 0, 0],
  scale: [3.2, 3.2, 3.2],
  color: '#5eead4',
  emissive: '#5eead4',
  emissiveIntensity: 2.2,
  opacity: 0.45,
  spin: 0.25,
  bob: 0.3,
});
// Bunk stacks along the east and west walls.
for (let i = 0; i < 4; i += 1) {
  const z = -15 + i * 10;
  props.push(box(`hab_bunk_w_${i}`, 'habitat', [-20, 0, z], [6, 5.4, 7], '#28323f', { metalness: 0.7 }));
  props.push(box(`hab_bunk_e_${i}`, 'habitat', [20, 0, z], [6, 5.4, 7], '#28323f', { metalness: 0.7 }));
  decor.push({
    id: `hab_bunk_w_glow_${i}`,
    area: 'habitat',
    kind: 'panel',
    position: [-16.9, 2.6, z],
    rotation: [0, Math.PI / 2, 0],
    scale: [5.2, 0.5, 1],
    color: '#5eead4',
    emissive: '#5eead4',
    emissiveIntensity: 2.4,
  });
  decor.push({
    id: `hab_bunk_e_glow_${i}`,
    area: 'habitat',
    kind: 'panel',
    position: [16.9, 2.6, z],
    rotation: [0, -Math.PI / 2, 0],
    scale: [5.2, 0.5, 1],
    color: '#5eead4',
    emissive: '#5eead4',
    emissiveIntensity: 2.4,
  });
}
// Noodle counter.
props.push(box('hab_counter', 'habitat', [-10, 0, 16], [10, 1.1, 2.4], '#3a2a1c', { emissive: '#f97316', emissiveIntensity: 0.12 }));
props.push(box('hab_counter_back', 'habitat', [-10, 0, 19], [10, 3.2, 1], '#2a2018'));
// Seating.
for (let i = 0; i < 5; i += 1) {
  props.push(box(`hab_stool_${i}`, 'habitat', [-14 + i * 2.2, 0, 13.6], [1, 0.9, 1], '#3f4a58'));
}
lights.push(
  { id: 'hab_l0', area: 'habitat', position: [0, 8, 0], color: '#5eead4', intensity: 270, distance: 44 },
  { id: 'hab_l1', area: 'habitat', position: [-12, 7.5, 16], color: '#f97316', intensity: 70, distance: 20 },
);

/* ----------------------------------------------------------------- MARKET */
// Trading rows: four stall blocks with holo-signage.
const stallColors = ['#fbbf24', '#38bdf8', '#a3e635', '#f43f5e'];
for (let i = 0; i < 4; i += 1) {
  const x = -15 + i * 10;
  const color = stallColors[i] ?? '#fbbf24';
  props.push(box(`mk_stall_${i}`, 'market', [x, 0, -76], [7, 2.6, 5], '#2b3240', { metalness: 0.7 }));
  props.push(box(`mk_counter_${i}`, 'market', [x, 0, -72], [7, 1.1, 1.6], '#3a4453', { emissive: color, emissiveIntensity: 0.5 }));
  decor.push({
    id: `mk_sign_${i}`,
    area: 'market',
    kind: 'panel',
    position: [x, 4.2, -73.2],
    rotation: [0, 0, 0],
    scale: [6, 1.4, 1],
    color,
    emissive: color,
    emissiveIntensity: 2.6,
    opacity: 0.85,
  });
}
// Syndicate booth tucked in the north-east corner.
props.push(box('mk_void_booth', 'market', [16, 0, -86], [9, 3.2, 6], '#20141a', { emissive: '#f43f5e', emissiveIntensity: 0.6 }));
// Central exchange column.
props.push(box('mk_column_base', 'market', [0, 0, -62], [5, 1, 5], '#232b38'));
decor.push({
  id: 'mk_exchange_holo',
  area: 'market',
  kind: 'holo',
  position: [0, 3.6, -62],
  rotation: [0, 0, 0],
  scale: [2.6, 2.6, 2.6],
  color: '#fbbf24',
  emissive: '#fbbf24',
  emissiveIntensity: 2.4,
  opacity: 0.5,
  spin: -0.35,
});
lights.push(
  { id: 'mk_l0', area: 'market', position: [0, 7, -70], color: '#fbbf24', intensity: 234, distance: 40 },
  { id: 'mk_l1', area: 'market', position: [16, 5, -86], color: '#f43f5e', intensity: 108, distance: 18 },
);

/* ----------------------------------------------------------------- HANGAR */
// Six berths marked out on the deck, with gantries between them.
for (let i = 0; i < 3; i += 1) {
  for (let j = 0; j < 2; j += 1) {
    const x = -98 + i * 18;
    const z = -84 + j * 26;
    props.push(box(`hg_pad_${i}_${j}`, 'hangar', [x, 0, z], [13, 0.35, 15], '#1b222c', { roughness: 0.85, solid: false }));
    decor.push({
      id: `hg_pad_ring_${i}_${j}`,
      area: 'hangar',
      kind: 'ring',
      position: [x, 0.45, z],
      rotation: [-Math.PI / 2, 0, 0],
      scale: [6.4, 6.4, 1],
      color: '#38bdf8',
      emissive: '#38bdf8',
      emissiveIntensity: 2,
      opacity: 0.7,
    });
  }
  props.push(box(`hg_gantry_${i}`, 'hangar', [-89 + i * 18, 0, -70], [1.6, 9, 40], '#333d4c', { metalness: 0.8 }));
}
// Tool walls and crate stacks.
for (let i = 0; i < 6; i += 1) {
  props.push(box(`hg_crate_${i}`, 'hangar', [-106 + (i % 3) * 3, 0, -50 + Math.floor(i / 3) * 3], [2.4, 2.4, 2.4], '#4a5462', { metalness: 0.5 }));
}
props.push(box('hg_bay_door', 'hangar', [-80, 0, -93], [40, 16, 1.4], '#141a22', { emissive: '#38bdf8', emissiveIntensity: 0.25 }));
lights.push(
  { id: 'hg_l0', area: 'hangar', position: [-80, 14, -70], color: '#38bdf8', intensity: 396, distance: 70 },
  { id: 'hg_l1', area: 'hangar', position: [-100, 8, -84], color: '#ffffff', intensity: 90, distance: 26 },
);

/* -------------------------------------------------------------------- LAB */
// Containment column in the centre, benches around the edge.
props.push(box('lab_core_base', 'lab', [80, 0, -70], [6, 1, 6], '#241c38'));
decor.push({
  id: 'lab_core_column',
  area: 'lab',
  kind: 'cylinder',
  position: [80, 4.5, -70],
  rotation: [0, 0, 0],
  scale: [1.8, 7, 1.8],
  color: '#a78bfa',
  emissive: '#a78bfa',
  emissiveIntensity: 2.2,
  opacity: 0.42,
  spin: 0.2,
});
for (let i = 0; i < 4; i += 1) {
  const z = -84 + i * 9;
  props.push(box(`lab_bench_${i}`, 'lab', [66, 0, z], [4, 1.1, 6], '#2c2740', { emissive: '#a78bfa', emissiveIntensity: 0.35 }));
  props.push(box(`lab_rack_${i}`, 'lab', [94, 0, z], [3, 4, 6], '#262137', { metalness: 0.75 }));
}
lights.push({ id: 'lab_l0', area: 'lab', position: [80, 8, -70], color: '#a78bfa', intensity: 270, distance: 44 });

/* ----------------------------------------------------------- COMMAND DECK */
props.push(box('cmd_holo_base', 'command_deck', [0, 7, -140], [9, 1, 9], '#141d2f'));
decor.push({
  id: 'cmd_station_holo',
  area: 'command_deck',
  kind: 'holo',
  position: [0, 11.4, -140],
  rotation: [0, 0, 0],
  scale: [5, 5, 5],
  color: '#60a5fa',
  emissive: '#60a5fa',
  emissiveIntensity: 2.4,
  opacity: 0.4,
  spin: 0.16,
});
for (let i = 0; i < 5; i += 1) {
  const x = -16 + i * 8;
  props.push(box(`cmd_console_${i}`, 'command_deck', [x, 7, -152], [5.4, 1.2, 2.2], '#1b2740', { emissive: '#60a5fa', emissiveIntensity: 0.6 }));
  decor.push({
    id: `cmd_screen_${i}`,
    area: 'command_deck',
    kind: 'panel',
    position: [x, 9.4, -153.4],
    rotation: [-0.25, 0, 0],
    scale: [4.6, 2.4, 1],
    color: '#60a5fa',
    emissive: '#60a5fa',
    emissiveIntensity: 2.2,
    opacity: 0.8,
  });
}
// The north face is glass: the station's best view.
decor.push({
  id: 'cmd_viewport',
  area: 'command_deck',
  kind: 'window',
  position: [0, 12, -157.4],
  rotation: [0, 0, 0],
  scale: [44, 9, 1],
  color: '#08131f',
  opacity: 0.25,
});
lights.push({ id: 'cmd_l0', area: 'command_deck', position: [0, 15, -140], color: '#60a5fa', intensity: 288, distance: 48 });

/* ------------------------------------------------------------- MINING BAY */
// Crushers west, assay line east, ore piles in the middle.
for (let i = 0; i < 3; i += 1) {
  const z = 58 + i * 12;
  props.push(box(`mb_crusher_${i}`, 'mining_bay', [-18, 0, z], [8, 6, 8], '#3a2a1e', { emissive: '#f97316', emissiveIntensity: 0.5, metalness: 0.8 }));
  props.push(box(`mb_assay_${i}`, 'mining_bay', [18, 0, z], [6, 2.4, 8], '#2f2a24', { emissive: '#fbbf24', emissiveIntensity: 0.3 }));
  decor.push({
    id: `mb_crusher_pipe_${i}`,
    area: 'mining_bay',
    kind: 'pipe',
    position: [-18, 7.2, z],
    rotation: [0, 0, Math.PI / 2],
    scale: [0.9, 12, 0.9],
    color: '#5a4636',
    metalness: 0.85,
    roughness: 0.4,
  });
}
props.push(box('mb_conveyor', 'mining_bay', [0, 0, 70], [3, 1.2, 32], '#2a2a2f', { emissive: '#f97316', emissiveIntensity: 0.25, solid: false }));
for (let i = 0; i < 4; i += 1) {
  props.push(box(`mb_orepile_${i}`, 'mining_bay', [-8 + i * 5.5, 0, 84], [3.4, 1.6, 3.4], '#6b5a44', { metalness: 0.2, roughness: 0.9 }));
}
lights.push(
  { id: 'mb_l0', area: 'mining_bay', position: [0, 10, 70], color: '#f97316', intensity: 270, distance: 48 },
  { id: 'mb_l1', area: 'mining_bay', position: [-18, 8, 70], color: '#fbbf24', intensity: 108, distance: 24 },
);

/* ------------------------------------------------------------ DOCKING BAY */
props.push(box('db_platform', 'docking_bay', [0, -4, 132], [24, 0.4, 14], '#16222b', { emissive: '#22d3ee', emissiveIntensity: 0.3, solid: false }));
for (let i = 0; i < 4; i += 1) {
  const x = -18 + i * 12;
  props.push(box(`db_clamp_${i}`, 'docking_bay', [x, -4, 150], [4, 2.4, 4], '#1d2c36', { metalness: 0.85 }));
  decor.push({
    id: `db_clamp_ring_${i}`,
    area: 'docking_bay',
    kind: 'ring',
    position: [x, -1.4, 150],
    rotation: [-Math.PI / 2, 0, 0],
    scale: [3, 3, 1],
    color: '#22d3ee',
    emissive: '#22d3ee',
    emissiveIntensity: 2.4,
    opacity: 0.75,
    spin: 0.6,
  });
}
// The containment field across the south aperture: solid to walk into, transparent to look through.
props.push(box('db_field', 'docking_bay', [0, -4, 163.6], [56, 20, 0.6], '#0e3a44', { emissive: '#22d3ee', emissiveIntensity: 0.9, metalness: 0.1, roughness: 0.6, group: 'field' }));
lights.push({ id: 'db_l0', area: 'docking_bay', position: [0, 10, 140], color: '#22d3ee', intensity: 306, distance: 56 });

/* ---------------------------------------------------------------- SHARED */
// Structural pillars in the two largest rooms, generated on a grid.
for (const [area, cx, cz, hx, hz, y, h] of [
  ['habitat', 0, 0, 24, 24, 0, 14],
  ['hangar', -80, -70, 30, 24, 0, 20],
] as const) {
  for (let sx = -1; sx <= 1; sx += 2) {
    for (let sz = -1; sz <= 1; sz += 2) {
      props.push(
        box(
          `${area}_pillar_${sx}_${sz}`,
          area,
          [cx + sx * (hx - 6), y, cz + sz * (hz - 6)],
          [2.2, h, 2.2],
          '#1f2733',
          { metalness: 0.8, roughness: 0.3, group: 'pillar' },
        ),
      );
    }
  }
}

export const STATION_PROPS: readonly StationProp[] = props;
export const STATION_DECOR: readonly DecorItem[] = decor;
export const STATION_LIGHTS: readonly AreaLight[] = lights;
