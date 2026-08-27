import type { CollisionWorld } from './collision.js';
import { groundAt, overlapsSolid } from './collision.js';
import type { CharacterParams } from './character.js';
import { distance2D, type Vec3M } from './math.js';

export type MovementVerdict = 'accepted' | 'corrected' | 'rejected';

export interface MovementCheck {
  readonly verdict: MovementVerdict;
  /** The position the server considers authoritative after the check. */
  readonly position: Vec3M;
  readonly reason?: string;
}

export interface MovementLimits {
  /** Tolerance multiplier on the theoretical maximum speed. */
  readonly speedTolerance: number;
  /** Absolute distance beyond which a move is a teleport, not lag. */
  readonly hardTeleport: number;
  /** How far above the local ground a player may legitimately be (jump arc). */
  readonly maxAirHeight: number;
}

export const DEFAULT_MOVEMENT_LIMITS: MovementLimits = {
  speedTolerance: 1.6,
  hardTeleport: 24,
  maxAirHeight: 4.5,
};

/**
 * Server-side movement check.
 *
 * Movement is *soft* authoritative: the client simulates locally for
 * responsiveness, and the server verifies that each reported position is
 * physically reachable, inside the station, and not inside a wall. A client
 * that fails the check is snapped back, and repeated failures are what the
 * gateway counts towards a kick.
 *
 * This never grants anything, so a perfect simulation is unnecessary — but it
 * does stop teleporting into locked areas and walking through walls, which are
 * the only two movement cheats that matter here.
 */
export function validateMovement(
  previous: Vec3M,
  claimed: Vec3M,
  dtSeconds: number,
  params: CharacterParams,
  world: CollisionWorld,
  limits: MovementLimits = DEFAULT_MOVEMENT_LIMITS,
): MovementCheck {
  if (
    !Number.isFinite(claimed.x) ||
    !Number.isFinite(claimed.y) ||
    !Number.isFinite(claimed.z)
  ) {
    return { verdict: 'rejected', position: previous, reason: 'non-finite position' };
  }

  const { min, max } = world.bounds;
  if (
    claimed.x < min[0] - 2 ||
    claimed.x > max[0] + 2 ||
    claimed.z < min[2] - 2 ||
    claimed.z > max[2] + 2 ||
    claimed.y < min[1] - 20 ||
    claimed.y > max[1] + 20
  ) {
    return { verdict: 'rejected', position: previous, reason: 'out of station bounds' };
  }

  const travelled = distance2D(previous.x, previous.z, claimed.x, claimed.z);
  if (travelled > limits.hardTeleport) {
    return { verdict: 'rejected', position: previous, reason: 'teleport' };
  }

  const budget =
    params.walkSpeed * params.runMultiplier * Math.max(dtSeconds, 0.016) * limits.speedTolerance +
    0.5;
  if (travelled > budget) {
    return { verdict: 'corrected', position: previous, reason: 'speed' };
  }

  // Match the controller's step rule: anything a player can walk up is not an
  // obstruction, so a kerb must not read as "inside geometry".
  const bottomY = claimed.y + params.stepHeight;
  const topY = claimed.y + params.height - 0.1;
  if (overlapsSolid(world, claimed.x, claimed.z, params.radius * 0.8, bottomY, topY)) {
    return { verdict: 'corrected', position: previous, reason: 'inside geometry' };
  }

  const ground = groundAt(world, claimed.x, claimed.z, claimed.y, params.stepHeight);
  if (ground.y === null) {
    return { verdict: 'corrected', position: previous, reason: 'no floor' };
  }
  if (claimed.y > ground.y + limits.maxAirHeight) {
    return { verdict: 'corrected', position: previous, reason: 'flying' };
  }
  if (claimed.y < ground.y - 3) {
    return { verdict: 'corrected', position: previous, reason: 'below floor' };
  }

  return { verdict: 'accepted', position: claimed };
}
