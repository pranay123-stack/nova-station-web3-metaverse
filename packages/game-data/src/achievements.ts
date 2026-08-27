import type { AchievementDef } from './types.js';

export const ACHIEVEMENTS: readonly AchievementDef[] = [
  { id: 'ach_first_dock', name: 'Welcome Aboard', description: 'Reach level 2.', icon: '🛰', points: 10, hidden: false, metric: 'level', threshold: 2 },
  { id: 'ach_level_10', name: 'Station Regular', description: 'Reach level 10.', icon: '⭐', points: 30, hidden: false, metric: 'level', threshold: 10 },
  { id: 'ach_level_20', name: 'Veteran Commander', description: 'Reach level 20.', icon: '🌟', points: 80, hidden: false, metric: 'level', threshold: 20 },
  { id: 'ach_mission_1', name: 'On The Books', description: 'Complete your first mission.', icon: '📋', points: 10, hidden: false, metric: 'missions_completed', threshold: 1 },
  { id: 'ach_mission_25', name: 'Contract Runner', description: 'Complete 25 missions.', icon: '📑', points: 40, hidden: false, metric: 'missions_completed', threshold: 25 },
  { id: 'ach_mission_100', name: 'Station Fixture', description: 'Complete 100 missions.', icon: '🏅', points: 120, hidden: false, metric: 'missions_completed', threshold: 100 },
  { id: 'ach_mined_1k', name: 'Rock Breaker', description: 'Extract 1,000 units of ore.', icon: '⛏', points: 20, hidden: false, metric: 'resources_mined', threshold: 1000 },
  { id: 'ach_mined_25k', name: 'Belt Baron', description: 'Extract 25,000 units of ore.', icon: '🪨', points: 90, hidden: false, metric: 'resources_mined', threshold: 25000 },
  { id: 'ach_credits_100k', name: 'Six Figures', description: 'Earn 100,000 credits in total.', icon: '💠', points: 60, hidden: false, metric: 'credits_earned', threshold: 100000 },
  { id: 'ach_craft_1', name: 'Bench Time', description: 'Craft your first item.', icon: '🔧', points: 10, hidden: false, metric: 'items_crafted', threshold: 1 },
  { id: 'ach_craft_50', name: 'Master Fabricator', description: 'Craft 50 items.', icon: '⚙', points: 70, hidden: false, metric: 'items_crafted', threshold: 50 },
  { id: 'ach_expedition_10', name: 'Deep Runner', description: 'Complete 10 expeditions.', icon: '🚀', points: 35, hidden: false, metric: 'expeditions', threshold: 10 },
  { id: 'ach_trade_10', name: 'Open For Business', description: 'Complete 10 marketplace trades.', icon: '🏪', points: 40, hidden: false, metric: 'trades', threshold: 10 },
  { id: 'ach_walk_10k', name: 'Deck Walker', description: 'Walk 10 kilometres inside the station.', icon: '👣', points: 25, hidden: false, metric: 'distance_walked', threshold: 10000 },
  { id: 'ach_asset_1', name: 'On The Registry', description: 'Own your first on-chain asset.', icon: '🔗', points: 50, hidden: false, metric: 'assets_owned', threshold: 1 },
  { id: 'ach_asset_5', name: 'Collector', description: 'Own five on-chain assets.', icon: '💎', points: 110, hidden: true, metric: 'assets_owned', threshold: 5 },
];

export const ACHIEVEMENTS_BY_ID: ReadonlyMap<string, AchievementDef> = new Map(
  ACHIEVEMENTS.map((a) => [a.id, a]),
);
