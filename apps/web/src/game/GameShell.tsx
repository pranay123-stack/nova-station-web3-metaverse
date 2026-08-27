'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { INTERACTABLES_BY_ID, type InteractableKind } from '@nova/game-data';
import { api } from '@/lib/api';
import { useGameStore, type PanelId } from '@/stores/useGameStore';
import { usePlayerStore } from '@/stores/usePlayerStore';
import { useSettingsStore, systemPrefersReducedMotion } from '@/stores/useSettingsStore';
import { gameSocket } from '@/game/net/socket';
import { attachInput, exitPointerLock, requestPointerLock } from '@/game/systems/input';
import { initAudio, playInteract, playUiOpen, startAmbient, stopAmbient } from '@/game/audio/engine';
import { StationScene } from '@/game/scene/StationScene';
import { AsteroidFieldScene } from '@/game/scene/AsteroidField';
import { Hud } from '@/ui/hud/Hud';
import { MiningHud } from '@/ui/hud/MiningHud';
import { TravelScreen } from '@/ui/hud/TravelScreen';
import { PanelHost } from '@/ui/panels/PanelHost';
import { TouchControls } from '@/ui/TouchControls';
import { LoadingScreen, type LoadStep } from '@/ui/LoadingScreen';

/** Terminals map onto the panel they open. */
const INTERACTION_PANEL: Partial<Record<InteractableKind, PanelId>> = {
  mission_terminal: 'missions',
  hangar_console: 'hangar',
  market_console: 'market',
  craft_bench: 'lab',
  research_console: 'lab',
  refinery: 'refinery',
  storage: 'inventory',
  launch_console: 'launch',
  avatar_station: 'avatar',
  leaderboard: 'leaderboard',
};

/**
 * The game shell.
 *
 * Owns the canvas, the socket lifecycle and the phase machine that decides
 * whether the player is standing on the station or flying in a field. The 3D
 * scene is mounted once and swapped by phase — remounting the canvas would
 * throw away every compiled shader.
 */
export function GameShell() {
  const phase = useGameStore((state) => state.phase);
  const panel = useGameStore((state) => state.panel);
  const setPhase = useGameStore((state) => state.setPhase);
  const openPanel = useGameStore((state) => state.openPanel);
  const closePanel = useGameStore((state) => state.closePanel);
  const setChatOpen = useGameStore((state) => state.setChatOpen);
  const setEmoteWheel = useGameStore((state) => state.setEmoteWheel);
  const toast = useGameStore((state) => state.toast);

  const refreshAll = usePlayerStore((state) => state.refreshAll);
  const expedition = usePlayerStore((state) => state.expedition);
  const ships = usePlayerStore((state) => state.ships);

  const containerRef = useRef<HTMLDivElement>(null);
  const [steps, setSteps] = useState<LoadStep[]>([
    { label: 'Loading station', value: 0 },
    { label: 'Loading assets', value: 0 },
    { label: 'Synchronising world', value: 0 },
  ]);
  const [ready, setReady] = useState(false);

  const bump = useCallback((index: number, value: number) => {
    setSteps((current) =>
      current.map((step, i) => (i === index ? { ...step, value: Math.max(step.value, value) } : step)),
    );
  }, []);

  /* ------------------------------------------------------------- boot */
  useEffect(() => {
    document.body.dataset.game = 'true';
    if (systemPrefersReducedMotion()) {
      useSettingsStore.getState().set('reducedMotion', true);
    }

    void (async () => {
      bump(0, 40);
      try {
        await refreshAll();
        bump(0, 100);
        bump(1, 70);
      } catch {
        toast({ kind: 'error', title: 'Could not load your commander record.' });
      }

      gameSocket.connect();
      bump(2, 60);

      // Give the renderer a moment to compile shaders before dropping the veil.
      window.setTimeout(() => {
        bump(1, 100);
        bump(2, 100);
        setReady(true);
      }, 900);
    })();

    return () => {
      delete document.body.dataset.game;
      gameSocket.disconnect();
      stopAmbient();
    };
  }, [refreshAll, bump, toast]);

  /* ---------------------------------------------- resume an expedition */
  useEffect(() => {
    if (!expedition) {
      if (phase === 'field' || phase === 'travelling') setPhase('station');
      return;
    }
    if (expedition.status === 'travelling') setPhase('travelling');
    else if (expedition.status === 'active' || expedition.status === 'returning') setPhase('field');
  }, [expedition, phase, setPhase]);

  /* ----------------------------------------------------------- input */
  const interact = useCallback(() => {
    const nearby = useGameStore.getState().nearby;
    if (!nearby) return;
    const definition = INTERACTABLES_BY_ID.get(nearby.id);
    if (!definition) return;

    playInteract();

    // The server re-checks proximity; this call is what makes an interaction
    // count towards a "visit the command deck" objective.
    void api
      .post('/api/player/interact', {
        interactableId: definition.id,
        position: {
          x: gameSocket.pose.x,
          y: gameSocket.pose.y,
          z: gameSocket.pose.z,
        },
      })
      .then(() => usePlayerStore.getState().refreshMissions())
      .catch(() => undefined);

    if (definition.kind === 'lore') {
      toast({ kind: 'info', title: definition.label, detail: definition.payload, ttl: 9000 });
      return;
    }

    const panel = INTERACTION_PANEL[definition.kind];
    if (panel) {
      playUiOpen();
      openPanel(panel);
    }
  }, [openPanel, toast]);

  /* ---------------------------------------------------- pointer lock */
  useEffect(() => {
    const element = containerRef.current;
    if (!element) return undefined;

    // Clicking the world captures the pointer so the mouse steers the camera.
    // Clicks on HUD controls bubble from a button and are ignored.
    const onPointerDown = (event: PointerEvent) => {
      if (useGameStore.getState().panel) return;
      if (useGameStore.getState().chatOpen) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest('button, a, input, select, textarea, [role="dialog"]')) return;
      requestPointerLock(element);
    };

    const onLockChange = () => {
      useGameStore.getState().setPointerLocked(document.pointerLockElement === element);
    };

    element.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('pointerlockchange', onLockChange);
    return () => {
      element.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('pointerlockchange', onLockChange);
    };
  }, []);

  // Opening a panel releases the pointer so the cursor is usable again.
  useEffect(() => {
    if (panel) exitPointerLock();
  }, [panel]);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return undefined;

    return attachInput(element, {
      onInteract: interact,
      onToggleMenu: () => {
        const state = useGameStore.getState();
        if (state.chatOpen) {
          state.setChatOpen(false);
          return;
        }
        // The browser uses Escape to release a captured pointer. Opening the
        // menu on the same press would mean a player who just wanted their
        // cursor back gets a dialog they did not ask for.
        if (document.pointerLockElement) return;
        if (state.panel) closePanel();
        else openPanel('menu');
      },
      onOpenPanel: (panel) => {
        const state = useGameStore.getState();
        playUiOpen();
        state.openPanel(state.panel === panel ? null : panel);
      },
      onChat: () => setChatOpen(true),
      onEmoteWheel: (open) => setEmoteWheel(open),
    });
  }, [interact, closePanel, openPanel, setChatOpen, setEmoteWheel]);

  /* ---------------------------------------------------------- audio */
  useEffect(() => {
    const start = () => {
      initAudio();
      startAmbient();
      window.removeEventListener('pointerdown', start);
      window.removeEventListener('keydown', start);
    };
    // Browsers refuse to start an audio context before a gesture.
    window.addEventListener('pointerdown', start);
    window.addEventListener('keydown', start);
    return () => {
      window.removeEventListener('pointerdown', start);
      window.removeEventListener('keydown', start);
    };
  }, []);

  const activeShip = ships.find((ship) => ship.active) ?? ships[0] ?? null;
  const inField = phase === 'field' && expedition && activeShip;

  return (
    <div ref={containerRef} className="relative h-screen w-screen overflow-hidden bg-[#05070d]">
      {/*
        Explicit layers. The canvas and the HUD are siblings, and relying on DOM
        order to decide which one receives a click is fragile — R3F gives its
        wrapper a stacking context of its own. Naming the layers means a button
        is always clickable and the world is always behind it.
      */}
      <div className="absolute inset-0 z-0">
      <Canvas
        camera={{ position: [0, 4, 22], fov: 62, near: 0.1, far: 2000 }}
        dpr={[1, 2]}
        gl={{ antialias: true, powerPreference: 'high-performance', alpha: false }}
        onCreated={({ gl }) => {
          gl.setClearColor('#05070d');
        }}
      >
        {inField ? (
          <AsteroidFieldScene
            zoneId={expedition.zoneId}
            fieldSeed={expedition.fieldSeed}
            shipDefId={activeShip.defId}
            shipSpeed={activeShip.stats.speed}
            minedNodes={expedition.minedNodes}
            scannedNodes={expedition.scannedNodes}
          />
        ) : (
          <StationScene />
        )}
      </Canvas>
      </div>

      <div className="pointer-events-none absolute inset-0 z-10">
        {inField ? <MiningHud /> : <Hud />}
      </div>

      {phase === 'travelling' && <TravelScreen />}
      <TouchControls />
      <PanelHost />
      <LoadingScreen steps={steps} done={ready} />
    </div>
  );
}
