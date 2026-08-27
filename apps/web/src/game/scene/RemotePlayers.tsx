'use client';

import { useEffect, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Billboard, Text } from '@react-three/drei';
import * as THREE from 'three';
import type { Emote, PlayerIdentity } from '@nova/shared';
import { useGameStore } from '@/stores/useGameStore';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { remoteBuffer } from '@/game/net/interpolation';
import { emoteBus } from '@/game/net/socket';
import { Avatar, DEFAULT_LOOK, type AvatarLook } from './Avatar';

/**
 * Other players.
 *
 * Each body reads its position from the interpolation buffer inside
 * `useFrame`, never from React state — so a room with twenty commanders in it
 * costs twenty matrix updates a frame, not twenty re-renders. React is only
 * involved when someone joins or leaves.
 */
const EMOTE_DURATION_MS = 3200;

export function RemotePlayers() {
  const players = useGameStore((state) => state.remotePlayers);
  const list = Array.from(players.values());

  return (
    <group name="remote-players">
      {list.map((player) => (
        <RemotePlayer key={player.id} player={player} />
      ))}
    </group>
  );
}

function RemotePlayer({ player }: { player: PlayerIdentity }) {
  const group = useRef<THREE.Group>(null);
  const [emote, setEmote] = useState<Emote | null>(null);
  const speed = useRef(0);
  const visible = useRef(true);

  useEffect(() => {
    return emoteBus.subscribe((id, played) => {
      if (id !== player.id) return;
      setEmote(played);
      window.setTimeout(() => setEmote(null), EMOTE_DURATION_MS);
    });
  }, [player.id]);

  useFrame(() => {
    const node = group.current;
    if (!node) return;

    const pose = remoteBuffer.sample(player.id);
    if (!pose) {
      // No samples yet: hide rather than parking a body at the origin.
      if (visible.current) {
        node.visible = false;
        visible.current = false;
      }
      return;
    }

    if (!visible.current) {
      node.visible = true;
      visible.current = true;
    }

    node.position.set(pose.x, pose.y, pose.z);
    node.rotation.y = pose.yaw;
    speed.current = pose.speed;
  });

  const look: AvatarLook = {
    ...DEFAULT_LOOK,
    ...player.avatar,
  };

  return (
    <group ref={group}>
      <Avatar look={look} speed={speed.current} emote={emote} />
      <Nameplate player={player} />
    </group>
  );
}

function Nameplate({ player }: { player: PlayerIdentity }) {
  const show = useSettingsStore((state) => state.showNameplates);
  if (!show) return null;

  const factionColor =
    player.faction === 'federation'
      ? '#60a5fa'
      : player.faction === 'helix'
        ? '#fbbf24'
        : player.faction === 'void'
          ? '#f43f5e'
          : '#94a3b8';

  return (
    <Billboard position={[0, 2.3, 0]}>
      <Text
        fontSize={0.19}
        color="#e7eefc"
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.012}
        outlineColor="#020617"
        maxWidth={6}
      >
        {player.name}
      </Text>
      <Text
        position={[0, -0.22, 0]}
        fontSize={0.13}
        color={factionColor}
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.01}
        outlineColor="#020617"
      >
        {`LV ${player.level}`}
      </Text>
    </Billboard>
  );
}
