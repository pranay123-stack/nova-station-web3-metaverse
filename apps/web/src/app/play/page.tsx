'use client';

import dynamic from 'next/dynamic';
import { useState } from 'react';
import { ConnectGate } from '@/ui/ConnectGate';

/**
 * The game route.
 *
 * The 3D shell is loaded only after sign-in and only on the client: it pulls in
 * three.js and the whole scene graph, and nobody sitting on the connect screen
 * should be paying to download it.
 */
const GameShell = dynamic(() => import('@/game/GameShell').then((module) => module.GameShell), {
  ssr: false,
});

export default function PlayPage() {
  const [ready, setReady] = useState(false);

  if (!ready) return <ConnectGate onReady={() => setReady(true)} />;
  return <GameShell />;
}
