'use client';

import { INPUT_HZ, type ClientMessage, type Emote, type ServerMessage } from '@nova/shared';
import type { StationAreaId } from '@nova/game-data';
import { sessionTokenForSocket } from '@/lib/api';
import { useGameStore } from '@/stores/useGameStore';
import { useNetStore } from '@/stores/useNetStore';
import { remoteBuffer } from './interpolation';

/**
 * The game socket.
 *
 * A plain class rather than a hook, because the render loop needs to push
 * positions into it every frame without React being involved. React only
 * subscribes to the connection *status*, which changes rarely.
 *
 * Reconnection backs off exponentially and gives up after a fixed number of
 * attempts rather than hammering a server that is down.
 */
const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? 'ws://localhost:4300/ws';
const MAX_ATTEMPTS = 8;
const BASE_BACKOFF_MS = 800;
const MAX_BACKOFF_MS = 15_000;
const PING_INTERVAL_MS = 5000;

export interface LocalPose {
  x: number;
  y: number;
  z: number;
  yaw: number;
  state: 'idle' | 'walk' | 'run' | 'jump' | 'fall';
}

type CorrectionHandler = (position: { x: number; y: number; z: number }) => void;

export class GameSocket {
  private socket: WebSocket | null = null;
  private attempts = 0;
  private closedByUs = false;
  private inputTimer: ReturnType<typeof setInterval> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private lastSent: LocalPose | null = null;

  /** Written by the render loop every frame; read by the input timer. */
  readonly pose: LocalPose = { x: 0, y: 0, z: 14, yaw: 0, state: 'idle' };
  selfId: string | null = null;
  onCorrection: CorrectionHandler | null = null;

  connect(): void {
    if (this.socket && this.socket.readyState <= WebSocket.OPEN) return;
    this.closedByUs = false;

    const net = useNetStore.getState();
    net.setConnection(this.attempts === 0 ? 'connecting' : 'reconnecting');

    // A WebSocket upgrade carries cookies only when same-site, so the token is
    // passed explicitly when one is held. The server accepts either.
    const token = sessionTokenForSocket();
    const url = token ? `${WS_URL}?token=${encodeURIComponent(token)}` : WS_URL;

    let socket: WebSocket;
    try {
      socket = new WebSocket(url);
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.socket = socket;

    socket.addEventListener('open', () => {
      this.attempts = 0;
      useNetStore.getState().setConnection('online');
      useNetStore.getState().setAttempts(0);
      useNetStore.getState().setError(null);
      this.startTimers();
    });

    socket.addEventListener('message', (event) => {
      let message: ServerMessage;
      try {
        message = JSON.parse(String(event.data)) as ServerMessage;
      } catch {
        return;
      }
      this.handle(message);
    });

    socket.addEventListener('close', (event) => {
      this.stopTimers();
      this.socket = null;
      remoteBuffer.clear();
      useGameStore.getState().setRemotePlayers([]);

      if (this.closedByUs) {
        useNetStore.getState().setConnection('offline');
        return;
      }
      // 4401/4403 mean the session is not valid: retrying cannot help.
      if (event.code === 4401 || event.code === 4403) {
        useNetStore.getState().setConnection('failed');
        useNetStore.getState().setError('Your session expired. Sign in again.');
        return;
      }
      if (event.code === 4001) {
        useNetStore.getState().setConnection('failed');
        useNetStore.getState().setError('You signed in from another window.');
        return;
      }
      this.scheduleReconnect();
    });

    socket.addEventListener('error', () => {
      // The close handler does the recovery; this only records the cause.
      useNetStore.getState().setError('Connection to the station was interrupted.');
    });
  }

  disconnect(): void {
    this.closedByUs = true;
    this.stopTimers();
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.socket?.close(1000, 'Leaving');
    this.socket = null;
    remoteBuffer.clear();
    useNetStore.getState().setConnection('offline');
  }

  private scheduleReconnect(): void {
    this.attempts += 1;
    useNetStore.getState().setAttempts(this.attempts);

    if (this.attempts > MAX_ATTEMPTS) {
      useNetStore.getState().setConnection('failed');
      useNetStore.getState().setError('Could not reach the station. Reload to try again.');
      return;
    }

    useNetStore.getState().setConnection('reconnecting');
    const delay = Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** (this.attempts - 1));
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  private startTimers(): void {
    this.stopTimers();
    this.inputTimer = setInterval(() => this.flushPose(), 1000 / INPUT_HZ);
    this.pingTimer = setInterval(() => {
      this.send({ t: 'ping', ts: Date.now() });
    }, PING_INTERVAL_MS);
  }

  private stopTimers(): void {
    if (this.inputTimer) clearInterval(this.inputTimer);
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.inputTimer = null;
    this.pingTimer = null;
  }

  /**
   * Sends the local pose, but only when it actually changed.
   *
   * A player standing still produces no traffic at all, which is most players
   * most of the time — the single biggest bandwidth saving available.
   */
  private flushPose(): void {
    const pose = this.pose;
    const last = this.lastSent;
    const moved =
      !last ||
      Math.abs(last.x - pose.x) > 0.02 ||
      Math.abs(last.y - pose.y) > 0.02 ||
      Math.abs(last.z - pose.z) > 0.02 ||
      Math.abs(last.yaw - pose.yaw) > 0.02 ||
      last.state !== pose.state;
    if (!moved) return;

    this.send({
      t: 'move',
      p: {
        x: Math.round(pose.x * 100) / 100,
        y: Math.round(pose.y * 100) / 100,
        z: Math.round(pose.z * 100) / 100,
      },
      y: Math.round(pose.yaw * 1000) / 1000,
      s: pose.state,
      ts: Date.now(),
    });
    this.lastSent = { ...pose };
  }

  send(message: ClientMessage): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
    this.socket.send(JSON.stringify(message));
  }

  sendChat(channel: 'station' | 'area' | 'direct', text: string, to?: string): void {
    const trimmed = text.trim().slice(0, 240);
    if (!trimmed) return;
    this.send({ t: 'chat', c: channel, m: trimmed, ...(to ? { to: to as `0x${string}` } : {}) });
  }

  sendEmote(emote: Emote): void {
    this.send({ t: 'emote', e: emote });
  }

  sendArea(area: StationAreaId): void {
    this.send({ t: 'area', a: area });
  }

  private handle(message: ServerMessage): void {
    const game = useGameStore.getState();

    switch (message.t) {
      case 'welcome':
        this.selfId = message.selfId;
        game.setRemotePlayers([...message.players]);
        this.pose.x = message.spawn.x;
        this.pose.y = message.spawn.y;
        this.pose.z = message.spawn.z;
        this.pose.yaw = message.spawn.yaw;
        return;

      case 'snapshot':
        remoteBuffer.ingest(message.players);
        return;

      case 'join':
        game.addRemotePlayer(message.player);
        game.toast({ kind: 'info', title: `${message.player.name} docked`, ttl: 3000 });
        return;

      case 'leave':
        game.removeRemotePlayer(message.id);
        remoteBuffer.forget(message.id);
        return;

      case 'chat':
        game.pushChat({
          id: `${message.id}-${message.ts}`,
          name: message.name,
          address: message.address,
          channel: message.c,
          text: message.m,
          at: message.ts,
        });
        return;

      case 'emote':
        emoteBus.emit(message.id, message.e);
        return;

      case 'correction':
        useNetStore.getState().bumpCorrections();
        this.pose.x = message.p.x;
        this.pose.y = message.p.y;
        this.pose.z = message.p.z;
        this.lastSent = null;
        this.onCorrection?.(message.p);
        return;

      case 'pong':
        useNetStore.getState().setLatency(Math.max(0, Date.now() - message.ts));
        return;

      case 'presence':
        game.setPresence(message.count, message.areas);
        return;

      case 'notice':
        game.toast({
          kind: message.level === 'error' ? 'error' : message.level === 'warn' ? 'warn' : 'info',
          title: message.m,
        });
        return;

      case 'error':
        if (message.code !== 'rate_limited') {
          game.toast({ kind: 'warn', title: message.m });
        }
        return;

      default:
        return;
    }
  }
}

/** Emotes are consumed by the renderer, not by React state. */
class EmoteBus {
  private readonly listeners = new Set<(id: string, emote: Emote) => void>();

  emit(id: string, emote: Emote): void {
    for (const listener of this.listeners) listener(id, emote);
  }

  subscribe(listener: (id: string, emote: Emote) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

export const emoteBus = new EmoteBus();
export const gameSocket = new GameSocket();
