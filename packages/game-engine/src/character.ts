import { BASE_PLAYER_STATS } from '@nova/game-data';
import type { CollisionWorld } from './collision.js';
import { groundAt, resolvePenetration, sweepAxis } from './collision.js';
import { clamp, type Vec3M } from './math.js';

export interface CharacterParams {
  readonly radius: number;
  readonly height: number;
  readonly walkSpeed: number;
  readonly runMultiplier: number;
  readonly jumpVelocity: number;
  readonly gravity: number;
  readonly stepHeight: number;
  readonly maxFallSpeed: number;
  /** How quickly horizontal velocity reaches the input target, per second. */
  readonly acceleration: number;
  /** Fraction of ground control retained while airborne. */
  readonly airControl: number;
}

export const DEFAULT_CHARACTER_PARAMS: CharacterParams = {
  radius: 0.42,
  height: 1.8,
  walkSpeed: BASE_PLAYER_STATS.walkSpeed,
  runMultiplier: BASE_PLAYER_STATS.runMultiplier,
  jumpVelocity: BASE_PLAYER_STATS.jumpVelocity,
  gravity: -24,
  stepHeight: 0.55,
  maxFallSpeed: 45,
  acceleration: 26,
  airControl: 0.45,
};

export interface CharacterState {
  position: Vec3M;
  /** Horizontal velocity, world space. */
  velocityX: number;
  velocityZ: number;
  velocityY: number;
  grounded: boolean;
  /** Facing, radians around Y. */
  yaw: number;
}

export interface CharacterInput {
  /** -1..1, right positive. */
  readonly moveX: number;
  /** -1..1, forward positive. */
  readonly moveZ: number;
  /** Camera yaw the movement is relative to. */
  readonly lookYaw: number;
  readonly jump: boolean;
  readonly run: boolean;
}

export interface CharacterStepResult {
  /** True on the frame a jump was launched. */
  readonly jumped: boolean;
  /** True on the frame the character landed. */
  readonly landed: boolean;
  /** Horizontal distance covered this step, in metres. */
  readonly distance: number;
  /** Ground surface tag under the feet, if any. */
  readonly groundTag: string | null;
  /** True when horizontal motion was blocked by geometry. */
  readonly blocked: boolean;
}

export function createCharacterState(position: Vec3M, yaw = 0): CharacterState {
  return {
    position: { ...position },
    velocityX: 0,
    velocityZ: 0,
    velocityY: 0,
    grounded: false,
    yaw,
  };
}

/**
 * Advances a character by one fixed step.
 *
 * The client runs this every frame for local prediction; the server runs the
 * *same function* over reported inputs to decide whether a claimed position is
 * reachable. Because it is pure and deterministic, both arrive at the same
 * answer for the same inputs.
 */
export function stepCharacter(
  state: CharacterState,
  input: CharacterInput,
  params: CharacterParams,
  world: CollisionWorld,
  dt: number,
): CharacterStepResult {
  const step = clamp(dt, 0, 0.1);
  const wasGrounded = state.grounded;

  // Input in world space, relative to where the camera is looking.
  let inX = input.moveX;
  let inZ = input.moveZ;
  const magnitude = Math.hypot(inX, inZ);
  if (magnitude > 1) {
    inX /= magnitude;
    inZ /= magnitude;
  }
  const sin = Math.sin(input.lookYaw);
  const cos = Math.cos(input.lookYaw);
  // Forward is -Z in three.js convention, rotated by the camera yaw.
  const worldX = inX * cos - inZ * sin;
  const worldZ = inX * sin + inZ * cos;

  const speed = params.walkSpeed * (input.run ? params.runMultiplier : 1);
  const targetX = worldX * speed;
  const targetZ = worldZ * speed;
  const accel = params.acceleration * (state.grounded ? 1 : params.airControl);
  const blend = 1 - Math.exp(-accel * step);
  state.velocityX += (targetX - state.velocityX) * blend;
  state.velocityZ += (targetZ - state.velocityZ) * blend;

  if (Math.hypot(worldX, worldZ) > 0.001) {
    state.yaw = Math.atan2(worldX, worldZ);
  }

  let jumped = false;
  if (input.jump && state.grounded) {
    state.velocityY = params.jumpVelocity;
    state.grounded = false;
    jumped = true;
  }

  // Vertical integration first, so the step-up test below sees the new height.
  state.velocityY = Math.max(
    state.velocityY + params.gravity * step,
    -params.maxFallSpeed,
  );

  const startX = state.position.x;
  const startZ = state.position.z;

  // Horizontal sweep. Solids whose tops are below the step height are ignored
  // so the character walks up kerbs and crates instead of bumping into them.
  const feetY = state.position.y;
  const bottomY = feetY + params.stepHeight;
  const topY = feetY + params.height;

  let blocked = false;
  const moveX = state.velocityX * step;
  const moveZ = state.velocityZ * step;

  const sweptX = sweepAxis(world, startX, startZ, 'x', moveX, params.radius, bottomY, topY);
  if (sweptX.hit) {
    blocked = true;
    state.velocityX = 0;
  }
  const sweptZ = sweepAxis(
    world,
    sweptX.value,
    startZ,
    'z',
    moveZ,
    params.radius,
    bottomY,
    topY,
  );
  if (sweptZ.hit) {
    blocked = true;
    state.velocityZ = 0;
  }

  state.position.x = sweptX.value;
  state.position.z = sweptZ.value;

  const fixed = resolvePenetration(
    world,
    state.position.x,
    state.position.z,
    params.radius,
    bottomY,
    topY,
  );
  state.position.x = fixed.x;
  state.position.z = fixed.z;

  state.position.y += state.velocityY * step;

  const ground = groundAt(
    world,
    state.position.x,
    state.position.z,
    state.position.y,
    params.stepHeight,
  );

  let landed = false;
  if (ground.y !== null && state.position.y <= ground.y + 0.02 && state.velocityY <= 0) {
    state.position.y = ground.y;
    state.velocityY = 0;
    state.grounded = true;
    landed = !wasGrounded;
  } else {
    state.grounded = false;
  }

  // Absolute floor: if a player somehow leaves the station volume, put them
  // back on the nearest known surface rather than letting them fall forever.
  if (state.position.y < world.bounds.min[1] - 30) {
    state.position.y = ground.y ?? 0;
    state.velocityY = 0;
    state.grounded = true;
  }

  const dx = state.position.x - startX;
  const dz = state.position.z - startZ;

  return {
    jumped,
    landed,
    distance: Math.hypot(dx, dz),
    groundTag: ground.tag,
    blocked,
  };
}

/** The maximum horizontal distance a character can legitimately cover in `dt`. */
export function maxTravel(params: CharacterParams, dt: number): number {
  return params.walkSpeed * params.runMultiplier * dt;
}
