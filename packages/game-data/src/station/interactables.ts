import type { InteractableDef } from '../types.js';

/**
 * Every object a player can press E on. The client raycasts nothing: it simply
 * finds the nearest interactable inside its radius, and the server re-checks
 * that same radius before honouring any action bound to it.
 */
export const INTERACTABLES: readonly InteractableDef[] = [
  // ------------------------------------------------------------- HABITAT
  {
    id: 'habitat_avatar_station',
    kind: 'avatar_station',
    label: 'Suit Locker',
    prompt: 'Customise avatar',
    area: 'habitat',
    position: [8, 0, 18],
    rotationY: Math.PI,
    radius: 3,
    color: '#5eead4',
  },
  {
    id: 'habitat_missions',
    kind: 'mission_terminal',
    label: 'Public Job Board',
    prompt: 'Browse missions',
    area: 'habitat',
    position: [-8, 0, -18],
    rotationY: 0,
    radius: 3,
    color: '#5eead4',
  },
  {
    id: 'habitat_lore_1',
    kind: 'lore',
    label: 'Station Notice',
    prompt: 'Read notice',
    area: 'habitat',
    position: [8, 0, -18],
    rotationY: 0,
    radius: 2.5,
    color: '#94a3b8',
    payload:
      'NOTICE — Nova Station operates under Federation charter 44-A. Unregistered salvage is not, technically, illegal. It is simply not insured.',
  },
  {
    id: 'habitat_leaderboard',
    kind: 'leaderboard',
    label: 'Commander Standings',
    prompt: 'View leaderboard',
    area: 'habitat',
    position: [-18, 0, 10],
    rotationY: Math.PI / 2,
    radius: 3,
    color: '#5eead4',
  },

  // -------------------------------------------------------------- MARKET
  {
    id: 'market_console',
    kind: 'market_console',
    label: 'Nova Exchange',
    prompt: 'Open marketplace',
    area: 'market',
    position: [0, 0, -64],
    rotationY: 0,
    radius: 3.5,
    color: '#fbbf24',
  },
  {
    id: 'market_broker',
    kind: 'storage',
    label: 'Station Broker',
    prompt: 'Sell resources',
    area: 'market',
    position: [-15, 0, -72],
    rotationY: Math.PI,
    radius: 3,
    color: '#fbbf24',
  },
  {
    id: 'market_void_booth',
    kind: 'mission_terminal',
    label: 'Unmarked Booth',
    prompt: 'Talk to the broker',
    area: 'market',
    position: [16, 0, -83],
    rotationY: 0,
    radius: 3,
    color: '#f43f5e',
    payload: 'void',
  },

  // -------------------------------------------------------------- HANGAR
  {
    id: 'hangar_console',
    kind: 'hangar_console',
    label: 'Hangar Control',
    prompt: 'Manage ships',
    area: 'hangar',
    position: [-62, 0, -70],
    rotationY: -Math.PI / 2,
    radius: 3.5,
    color: '#38bdf8',
  },
  {
    id: 'hangar_missions',
    kind: 'mission_terminal',
    label: 'Flight Ops Terminal',
    prompt: 'Browse missions',
    area: 'hangar',
    position: [-62, 0, -58],
    rotationY: -Math.PI / 2,
    radius: 3,
    color: '#38bdf8',
    payload: 'helix',
  },

  // ----------------------------------------------------------------- LAB
  {
    id: 'lab_bench',
    kind: 'craft_bench',
    label: 'Fabrication Bench',
    prompt: 'Open crafting',
    area: 'lab',
    position: [69, 0, -70],
    rotationY: Math.PI / 2,
    radius: 3.5,
    color: '#a78bfa',
  },
  {
    id: 'lab_research',
    kind: 'research_console',
    label: 'Research Console',
    prompt: 'Federation contracts',
    area: 'lab',
    position: [91, 0, -70],
    rotationY: -Math.PI / 2,
    radius: 3,
    color: '#a78bfa',
    payload: 'federation',
  },

  // -------------------------------------------------------- COMMAND DECK
  {
    id: 'command_missions',
    kind: 'mission_terminal',
    label: 'Mission Command',
    prompt: 'Browse missions',
    area: 'command_deck',
    position: [-10, 7, -132],
    rotationY: Math.PI,
    radius: 3.5,
    color: '#60a5fa',
  },
  {
    id: 'command_registry',
    kind: 'lore',
    label: 'Station Registry',
    prompt: 'Log suit tag',
    area: 'command_deck',
    position: [10, 7, -132],
    rotationY: Math.PI,
    radius: 3,
    color: '#60a5fa',
    payload:
      'REGISTRY — Suit tag logged. Welcome to Nova Station, Commander. Your quarters are in the Habitat ring; your debts are your own.',
  },

  // ---------------------------------------------------------- MINING BAY
  {
    id: 'mining_refinery',
    kind: 'refinery',
    label: 'Ore Refinery',
    prompt: 'Refine ore',
    area: 'mining_bay',
    position: [-9, 0, 62],
    rotationY: 0,
    radius: 3.5,
    color: '#f97316',
  },
  {
    id: 'mining_storage',
    kind: 'storage',
    label: 'Bulk Storage',
    prompt: 'Open inventory',
    area: 'mining_bay',
    position: [9, 0, 62],
    rotationY: 0,
    radius: 3,
    color: '#f97316',
  },
  {
    id: 'mining_missions',
    kind: 'mission_terminal',
    label: 'Helix Work Board',
    prompt: 'Browse missions',
    area: 'mining_bay',
    position: [0, 0, 86],
    rotationY: Math.PI,
    radius: 3,
    color: '#fbbf24',
    payload: 'helix',
  },

  // --------------------------------------------------------- DOCKING BAY
  {
    id: 'docking_launch',
    kind: 'launch_console',
    label: 'Launch Control',
    prompt: 'Launch expedition',
    area: 'docking_bay',
    position: [0, -4, 126],
    rotationY: 0,
    radius: 4,
    color: '#22d3ee',
  },
  {
    id: 'docking_lore',
    kind: 'lore',
    label: 'Departure Board',
    prompt: 'Read departures',
    area: 'docking_bay',
    position: [-20, -4, 126],
    rotationY: 0,
    radius: 2.5,
    color: '#22d3ee',
    payload:
      'DEPARTURES — Nova Belt: on schedule. Kestrel Reach: on schedule. Helix Claim 44: lease holders only. The Rift: no scheduled service. No returns guaranteed.',
  },
];

export const INTERACTABLES_BY_ID: ReadonlyMap<string, InteractableDef> = new Map(
  INTERACTABLES.map((i) => [i.id, i]),
);
