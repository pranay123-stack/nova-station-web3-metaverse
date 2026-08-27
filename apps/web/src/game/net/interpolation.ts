import type { MovementState, PlayerSnapshot } from '@nova/shared';

/**
 * Remote-player interpolation buffer.
 *
 * Snapshots arrive ten times a second. Rendering them directly would look like
 * a slideshow, so each remote body is drawn slightly in the past — far enough
 * back that there is always a newer snapshot to interpolate towards, close
 * enough that other players do not feel laggy. 150ms is one and a half snapshot
 * intervals: it absorbs a dropped packet without a visible stall.
 *
 * This lives outside React entirely. The render loop samples it every frame;
 * putting it in a store would re-render the scene sixty times a second.
 */
export const INTERPOLATION_DELAY_MS = 150;
const MAX_SAMPLES = 12;
/** Beyond this gap the body is teleported rather than slid across the room. */
const SNAP_DISTANCE = 12;

interface Sample {
  readonly at: number;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly yaw: number;
  readonly state: MovementState;
}

export interface SampledPose {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly yaw: number;
  readonly state: MovementState;
  /** Horizontal speed in metres per second, used to drive the walk cycle. */
  readonly speed: number;
}

function shortestAngle(from: number, to: number): number {
  let delta = (to - from) % (Math.PI * 2);
  if (delta > Math.PI) delta -= Math.PI * 2;
  if (delta < -Math.PI) delta += Math.PI * 2;
  return delta;
}

export class RemoteBuffer {
  private readonly samples = new Map<string, Sample[]>();

  /** Records one server snapshot, stamped with local receipt time. */
  ingest(players: readonly PlayerSnapshot[], now = performance.now()): void {
    const seen = new Set<string>();
    for (const player of players) {
      seen.add(player.id);
      const list = this.samples.get(player.id) ?? [];
      list.push({ at: now, x: player.x, y: player.y, z: player.z, yaw: player.yaw, state: player.s });
      if (list.length > MAX_SAMPLES) list.splice(0, list.length - MAX_SAMPLES);
      this.samples.set(player.id, list);
    }
  }

  /** Drops a player who left, so their body stops being drawn. */
  forget(id: string): void {
    this.samples.delete(id);
  }

  clear(): void {
    this.samples.clear();
  }

  ids(): string[] {
    return [...this.samples.keys()];
  }

  /**
   * Position of a remote player as it should be drawn this frame.
   *
   * Returns null for a player with no samples yet — the caller skips drawing
   * rather than placing a body at the origin.
   */
  sample(id: string, now = performance.now()): SampledPose | null {
    const list = this.samples.get(id);
    if (!list || list.length === 0) return null;

    const target = now - INTERPOLATION_DELAY_MS;
    const newest = list[list.length - 1];
    if (!newest) return null;

    // Not enough history yet, or the render time is ahead of everything we
    // have: hold at the newest sample rather than extrapolating into a guess.
    if (list.length === 1 || target >= newest.at) {
      return { x: newest.x, y: newest.y, z: newest.z, yaw: newest.yaw, state: newest.state, speed: 0 };
    }

    const oldest = list[0];
    if (oldest && target <= oldest.at) {
      return { x: oldest.x, y: oldest.y, z: oldest.z, yaw: oldest.yaw, state: oldest.state, speed: 0 };
    }

    for (let i = list.length - 1; i > 0; i -= 1) {
      const after = list[i];
      const before = list[i - 1];
      if (!after || !before) continue;
      if (target >= before.at && target <= after.at) {
        const span = after.at - before.at;
        const t = span <= 0 ? 1 : (target - before.at) / span;
        const distance = Math.hypot(after.x - before.x, after.z - before.z);

        if (distance > SNAP_DISTANCE) {
          return { x: after.x, y: after.y, z: after.z, yaw: after.yaw, state: after.state, speed: 0 };
        }

        const speed = span > 0 ? (distance / span) * 1000 : 0;
        return {
          x: before.x + (after.x - before.x) * t,
          y: before.y + (after.y - before.y) * t,
          z: before.z + (after.z - before.z) * t,
          yaw: before.yaw + shortestAngle(before.yaw, after.yaw) * t,
          state: t > 0.5 ? after.state : before.state,
          speed,
        };
      }
    }

    return { x: newest.x, y: newest.y, z: newest.z, yaw: newest.yaw, state: newest.state, speed: 0 };
  }
}

/** One buffer per session, shared by the socket and the renderer. */
export const remoteBuffer = new RemoteBuffer();
