import type { WebSocket } from 'ws';
import {
  INTEREST_RADIUS,
  quantiseAngle,
  quantisePosition,
  type MovementState,
  type PlayerIdentity,
  type PlayerSnapshot,
  type ServerMessage,
} from '@nova/shared';
import type { StationAreaId } from '@nova/game-data';

export interface ConnectedPlayer {
  readonly id: string;
  readonly userId: string;
  readonly address: string;
  readonly socket: WebSocket;
  identity: PlayerIdentity;
  x: number;
  y: number;
  z: number;
  yaw: number;
  state: MovementState;
  area: StationAreaId;
  /** Metres walked since the last flush to the database. */
  pendingDistance: number;
  lastMoveAt: number;
  lastSeenAt: number;
  correctionCount: number;
  alive: boolean;
}

/**
 * The live world.
 *
 * A single process holds every connected player in memory. Snapshots are built
 * per recipient rather than broadcast wholesale, because interest management —
 * only sending players you could actually see — is what keeps bandwidth flat as
 * the station fills up.
 */
export class Room {
  private readonly players = new Map<string, ConnectedPlayer>();
  private readonly byUser = new Map<string, string>();

  add(player: ConnectedPlayer): void {
    // One session per account: a second connection replaces the first, which
    // stops a single player occupying several bodies at once.
    const existing = this.byUser.get(player.userId);
    if (existing && existing !== player.id) {
      const previous = this.players.get(existing);
      if (previous) {
        try {
          previous.socket.close(4001, 'Signed in elsewhere');
        } catch {
          /* the socket was already gone */
        }
        this.players.delete(existing);
      }
    }
    this.players.set(player.id, player);
    this.byUser.set(player.userId, player.id);
  }

  remove(id: string): ConnectedPlayer | null {
    const player = this.players.get(id);
    if (!player) return null;
    this.players.delete(id);
    if (this.byUser.get(player.userId) === id) this.byUser.delete(player.userId);
    return player;
  }

  get(id: string): ConnectedPlayer | undefined {
    return this.players.get(id);
  }

  byAddress(address: string): ConnectedPlayer | undefined {
    for (const player of this.players.values()) {
      if (player.address === address) return player;
    }
    return undefined;
  }

  size(): number {
    return this.players.size;
  }

  all(): ConnectedPlayer[] {
    return [...this.players.values()];
  }

  identities(): PlayerIdentity[] {
    return this.all().map((player) => player.identity);
  }

  areaCounts(): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const player of this.players.values()) {
      counts[player.area] = (counts[player.area] ?? 0) + 1;
    }
    return counts;
  }

  /** The snapshot one player should receive: everyone within interest range. */
  snapshotFor(viewer: ConnectedPlayer): PlayerSnapshot[] {
    const out: PlayerSnapshot[] = [];
    const radiusSq = INTEREST_RADIUS * INTEREST_RADIUS;
    for (const player of this.players.values()) {
      if (player.id === viewer.id) continue;
      const dx = player.x - viewer.x;
      const dz = player.z - viewer.z;
      if (dx * dx + dz * dz > radiusSq) continue;
      out.push({
        id: player.id,
        x: quantisePosition(player.x),
        y: quantisePosition(player.y),
        z: quantisePosition(player.z),
        yaw: quantiseAngle(player.yaw),
        s: player.state,
      });
    }
    return out;
  }

  send(player: ConnectedPlayer, message: ServerMessage): void {
    if (player.socket.readyState !== 1) return;
    try {
      player.socket.send(JSON.stringify(message));
    } catch {
      /* a dead socket is cleaned up by the close handler */
    }
  }

  broadcast(message: ServerMessage, exceptId?: string): void {
    for (const player of this.players.values()) {
      if (player.id === exceptId) continue;
      this.send(player, message);
    }
  }

  /** Broadcasts only to players inside interest range of an origin. */
  broadcastNear(origin: ConnectedPlayer, message: ServerMessage, includeSelf = false): void {
    const radiusSq = INTEREST_RADIUS * INTEREST_RADIUS;
    for (const player of this.players.values()) {
      if (player.id === origin.id && !includeSelf) continue;
      const dx = player.x - origin.x;
      const dz = player.z - origin.z;
      if (dx * dx + dz * dz > radiusSq) continue;
      this.send(player, message);
    }
  }

  broadcastArea(area: StationAreaId, message: ServerMessage): void {
    for (const player of this.players.values()) {
      if (player.area === area) this.send(player, message);
    }
  }
}
