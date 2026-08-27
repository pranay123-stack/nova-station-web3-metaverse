import { describe, expect, it } from 'vitest';
import { SPAWN_POINT, getStationGeometry } from '@nova/game-data';
import {
  DEFAULT_CHARACTER_PARAMS,
  createCharacterState,
  createCollisionWorld,
  overlapsSolid,
  stepCharacter,
  type CharacterInput,
} from '../src/index.js';

const world = createCollisionWorld(getStationGeometry());
const params = DEFAULT_CHARACTER_PARAMS;

const idle: CharacterInput = { moveX: 0, moveZ: 0, lookYaw: 0, jump: false, run: false };

function spawn() {
  return createCharacterState({ x: SPAWN_POINT[0], y: SPAWN_POINT[1] + 2, z: SPAWN_POINT[2] });
}

function simulate(
  state: ReturnType<typeof spawn>,
  input: CharacterInput,
  seconds: number,
  dt = 1 / 60,
) {
  const steps = Math.round(seconds / dt);
  let lastResult = stepCharacter(state, idle, params, world, dt);
  for (let i = 0; i < steps; i += 1) {
    lastResult = stepCharacter(state, input, params, world, dt);
  }
  return lastResult;
}

describe('character controller', () => {
  it('falls under gravity and lands on the floor', () => {
    const state = spawn();
    expect(state.grounded).toBe(false);
    simulate(state, idle, 1.5);
    expect(state.grounded).toBe(true);
    expect(state.position.y).toBeCloseTo(0, 3);
    expect(state.velocityY).toBe(0);
  });

  it('walks forward at roughly the configured speed', () => {
    const state = spawn();
    simulate(state, idle, 1);
    const startZ = state.position.z;
    // lookYaw 0 with moveZ -1 walks towards -Z (three.js forward).
    simulate(state, { ...idle, moveZ: -1 }, 1);
    const travelled = Math.abs(state.position.z - startZ);
    expect(travelled).toBeGreaterThan(params.walkSpeed * 0.8);
    expect(travelled).toBeLessThan(params.walkSpeed * 1.05);
  });

  it('runs faster than it walks', () => {
    const walk = spawn();
    simulate(walk, idle, 1);
    const walkStart = walk.position.z;
    simulate(walk, { ...idle, moveZ: -1 }, 1);
    const walked = Math.abs(walk.position.z - walkStart);

    const run = spawn();
    simulate(run, idle, 1);
    const runStart = run.position.z;
    simulate(run, { ...idle, moveZ: -1, run: true }, 1);
    const ran = Math.abs(run.position.z - runStart);

    expect(ran).toBeGreaterThan(walked * 1.5);
  });

  it('jumps only while grounded', () => {
    const state = spawn();
    simulate(state, idle, 1.5);
    const first = stepCharacter(state, { ...idle, jump: true }, params, world, 1 / 60);
    expect(first.jumped).toBe(true);
    const second = stepCharacter(state, { ...idle, jump: true }, params, world, 1 / 60);
    expect(second.jumped).toBe(false);
  });

  it('reports landing exactly once', () => {
    const state = spawn();
    let landings = 0;
    for (let i = 0; i < 200; i += 1) {
      if (stepCharacter(state, idle, params, world, 1 / 60).landed) landings += 1;
    }
    expect(landings).toBe(1);
  });

  it('never walks through a wall, however long it pushes', () => {
    const state = spawn();
    simulate(state, idle, 1);
    // Push west into the habitat wall for four seconds.
    simulate(state, { ...idle, moveX: -1, run: true }, 4);
    expect(state.position.x).toBeGreaterThan(-24);
    expect(
      overlapsSolid(world, state.position.x, state.position.z, params.radius * 0.9, 0.5, 1.8),
    ).toBe(false);
  });

  it('does not tunnel through a wall on a very long frame', () => {
    const state = spawn();
    simulate(state, idle, 1);
    state.position.x = -22;
    state.position.z = 0;
    state.velocityX = -400;
    // A pathological 100ms frame with an absurd velocity.
    stepCharacter(state, { ...idle, moveX: -1, run: true }, params, world, 0.1);
    expect(state.position.x).toBeGreaterThan(-24.6);
  });

  it('walks up the ramp to the command deck', () => {
    const state = createCharacterState({ x: 0, y: 0, z: -88 });
    simulate(state, idle, 0.5);
    expect(state.position.y).toBeCloseTo(0, 1);
    simulate(state, { ...idle, moveZ: -1, run: true }, 12);
    expect(state.position.z).toBeLessThan(-122);
    expect(state.position.y).toBeGreaterThan(6.5);
    expect(state.grounded).toBe(true);
  });

  it('accumulates walked distance', () => {
    const state = spawn();
    simulate(state, idle, 1);
    let total = 0;
    for (let i = 0; i < 60; i += 1) {
      total += stepCharacter(state, { ...idle, moveZ: -1 }, params, world, 1 / 60).distance;
    }
    expect(total).toBeGreaterThan(3);
  });

  it('faces the direction it is moving', () => {
    const state = spawn();
    simulate(state, idle, 1);
    simulate(state, { ...idle, moveX: 1 }, 0.5);
    expect(Math.abs(state.yaw)).toBeCloseTo(Math.PI / 2, 1);
  });

  it('clamps oversized diagonal input to unit speed', () => {
    const diagonal = spawn();
    simulate(diagonal, idle, 1);
    const startX = diagonal.position.x;
    const startZ = diagonal.position.z;
    simulate(diagonal, { ...idle, moveX: 1, moveZ: -1 }, 1);
    const distance = Math.hypot(
      diagonal.position.x - startX,
      diagonal.position.z - startZ,
    );
    expect(distance).toBeLessThan(params.walkSpeed * 1.05);
  });

  it('survives a zero or negative timestep', () => {
    const state = spawn();
    const before = { ...state.position };
    stepCharacter(state, idle, params, world, 0);
    stepCharacter(state, idle, params, world, -1);
    expect(state.position.x).toBeCloseTo(before.x, 6);
    expect(Number.isFinite(state.position.y)).toBe(true);
  });
});
