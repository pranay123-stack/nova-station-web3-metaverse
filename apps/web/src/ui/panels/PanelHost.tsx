'use client';

import { useEffect } from 'react';
import { Modal } from '@nova/ui';
import { useGameStore } from '@/stores/useGameStore';
import { suspendInput } from '@/game/systems/input';
import { playUiClose } from '@/game/audio/engine';
import { MissionsPanel } from './MissionsPanel';
import { InventoryPanel } from './InventoryPanel';
import { HangarPanel } from './HangarPanel';
import { MarketPanel } from './MarketPanel';
import { LabPanel } from './LabPanel';
import { MapPanel } from './MapPanel';
import { MenuPanel } from './MenuPanel';
import { AvatarPanel } from './AvatarPanel';
import { SocialPanel } from './SocialPanel';
import { LaunchPanel } from './LaunchPanel';
import { RefineryPanel } from './RefineryPanel';
import { BrokerPanel } from './BrokerPanel';
import { LeaderboardPanel } from './LeaderboardPanel';
import { AssetsPanel } from './AssetsPanel';

const TITLES: Record<string, string> = {
  missions: 'Mission Terminal',
  inventory: 'Inventory',
  hangar: 'Hangar Control',
  market: 'Nova Exchange',
  lab: 'Fabrication Bench',
  map: 'Station Map',
  menu: 'Menu',
  avatar: 'Suit Locker',
  social: 'Crew',
  launch: 'Launch Control',
  refinery: 'Ore Refinery',
  broker: 'Station Broker',
  leaderboard: 'Commander Standings',
  assets: 'On-Chain Assets',
};

const WIDTHS: Record<string, 'sm' | 'md' | 'lg' | 'xl'> = {
  missions: 'xl',
  inventory: 'lg',
  hangar: 'xl',
  market: 'xl',
  lab: 'lg',
  map: 'lg',
  menu: 'md',
  avatar: 'lg',
  social: 'md',
  launch: 'lg',
  refinery: 'md',
  broker: 'md',
  leaderboard: 'lg',
  assets: 'lg',
};

/**
 * Routes the open panel to its component.
 *
 * While a panel is open, movement input is suspended: a player reading their
 * inventory should not be walking around the station at the same time.
 */
export function PanelHost() {
  const panel = useGameStore((state) => state.panel);
  const close = useGameStore((state) => state.closePanel);

  useEffect(() => {
    suspendInput(panel !== null);
    return () => suspendInput(false);
  }, [panel]);

  if (!panel) return null;

  return (
    <Modal
      open
      onClose={() => {
        playUiClose();
        close();
      }}
      title={TITLES[panel] ?? 'Panel'}
      width={WIDTHS[panel] ?? 'md'}
    >
      {panel === 'missions' && <MissionsPanel />}
      {panel === 'inventory' && <InventoryPanel />}
      {panel === 'hangar' && <HangarPanel />}
      {panel === 'market' && <MarketPanel />}
      {panel === 'lab' && <LabPanel />}
      {panel === 'map' && <MapPanel />}
      {panel === 'menu' && <MenuPanel />}
      {panel === 'avatar' && <AvatarPanel />}
      {panel === 'social' && <SocialPanel />}
      {panel === 'launch' && <LaunchPanel />}
      {panel === 'refinery' && <RefineryPanel />}
      {panel === 'broker' && <BrokerPanel />}
      {panel === 'leaderboard' && <LeaderboardPanel />}
      {panel === 'assets' && <AssetsPanel />}
    </Modal>
  );
}
