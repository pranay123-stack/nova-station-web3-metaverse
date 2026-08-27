'use client';

import { Suspense, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { AdaptiveDpr, AdaptiveEvents, BakeShadows, Preload } from '@react-three/drei';
import { Bloom, EffectComposer, Vignette } from '@react-three/postprocessing';
import * as THREE from 'three';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { usePlayerStore } from '@/stores/usePlayerStore';
import { useCharacter } from '@/game/systems/useCharacter';
import { usePerformanceGovernor } from '@/game/systems/usePerformance';
import { Station } from './Station';
import { AreaLights, Decor } from './Decor';
import { Interactables } from './Interactables';
import { RemotePlayers } from './RemotePlayers';
import { SpaceBackdrop } from './SpaceBackdrop';
import { HangarShips } from './ShipModel';
import { Avatar, DEFAULT_LOOK, type AvatarLook } from './Avatar';

/**
 * The station scene graph.
 *
 * Ordered by cost: static geometry first (drawn once, never updated), then the
 * few things that move. Post-processing is a quality-gated afterthought rather
 * than a requirement — the scene reads correctly with it switched off.
 */
export function StationScene() {
  usePerformanceGovernor();
  const quality = useSettingsStore((state) => state.quality);
  const character = useCharacter();
  const ships = usePlayerStore((state) => state.ships);
  const avatar = usePlayerStore((state) => state.avatar);

  const look: AvatarLook = useMemo(
    () => (avatar ? { ...DEFAULT_LOOK, ...avatar } : DEFAULT_LOOK),
    [avatar],
  );

  return (
    <>
      {/*
        Ambient fill. The station is meant to feel dim and industrial, but a
        player still has to read the floor they are walking on — these levels
        are the floor of legibility, with the sector lights doing the shaping.
      */}
      <ambientLight intensity={0.55} color="#8fb0d6" />
      <hemisphereLight args={['#3d5f80', '#0a1018', 0.9]} />
      {/* A single directional light stands in for the system's star. */}
      <directionalLight position={[-160, 220, -240]} intensity={0.9} color="#cfe4ff" />

      <Suspense fallback={null}>
        <SpaceBackdrop />
        <Station />
        <Decor />
        <AreaLights />
        <Interactables />
        <HangarShips ships={ships} />
        <RemotePlayers />
        <LocalPlayer look={look} character={character} />
        <Preload all />
      </Suspense>

      <AdaptiveDpr pixelated />
      <AdaptiveEvents />
      <BakeShadows />

      {quality !== 'low' && (
        <EffectComposer enableNormalPass={false}>
          <Bloom
            intensity={quality === 'high' ? 0.85 : 0.5}
            luminanceThreshold={0.62}
            luminanceSmoothing={0.25}
            mipmapBlur
          />
          <Vignette eskil={false} offset={0.22} darkness={0.72} />
        </EffectComposer>
      )}
    </>
  );
}

function LocalPlayer({
  look,
  character,
}: {
  look: AvatarLook;
  character: ReturnType<typeof useCharacter>;
}) {
  const speed = useRef(0);

  useFrame(() => {
    speed.current = Math.hypot(character.state.velocityX, character.state.velocityZ);
  });

  return (
    <group ref={character.group}>
      <Avatar
        look={look}
        speed={speed.current}
        state={character.state.grounded ? 'walk' : 'jump'}
      />
      <PlayerLight />
    </group>
  );
}

/**
 * A soft light carried by the player.
 *
 * Without it a commander walking down an unlit corridor is a silhouette; with
 * it, they are lit by their own suit. One light, attached to one body.
 */
function PlayerLight() {
  const light = useRef<THREE.PointLight>(null);

  useFrame((state) => {
    if (!light.current) return;
    light.current.intensity = 42 + Math.sin(state.clock.elapsedTime * 1.6) * 3;
  });

  return <pointLight ref={light} position={[0, 1.6, 0]} color="#9fd8ff" distance={14} decay={2} />;
}
