'use client';

import { create } from 'zustand';
import type {
  ActiveMissionDto,
  AvatarStateDto,
  CraftDto,
  ExpeditionDto,
  InventoryDto,
  PlayerDto,
  ShipDto,
} from '@nova/shared';
import { api } from '@/lib/api';

/**
 * The client's mirror of server-owned state.
 *
 * Nothing here is authoritative. Every field arrives from an API response and
 * is replaced wholesale by the next one; the store never computes a balance or
 * an XP total of its own. That is deliberate — the moment the client starts
 * deriving economy numbers, the two copies drift and the UI starts lying.
 */
interface PlayerState {
  player: PlayerDto | null;
  avatar: AvatarStateDto | null;
  ships: ShipDto[];
  inventory: InventoryDto | null;
  missions: ActiveMissionDto[];
  crafts: CraftDto[];
  expedition: ExpeditionDto | null;
  loading: boolean;
  error: string | null;

  setPlayer: (player: PlayerDto) => void;
  setAvatar: (avatar: AvatarStateDto) => void;
  setShips: (ships: ShipDto[]) => void;
  setInventory: (inventory: InventoryDto) => void;
  setMissions: (missions: ActiveMissionDto[]) => void;
  setCrafts: (crafts: CraftDto[]) => void;
  setExpedition: (expedition: ExpeditionDto | null) => void;

  refreshPlayer: () => Promise<void>;
  refreshShips: () => Promise<void>;
  refreshInventory: () => Promise<void>;
  refreshMissions: () => Promise<void>;
  refreshCrafts: () => Promise<void>;
  refreshExpedition: () => Promise<void>;
  refreshAll: () => Promise<void>;
  reset: () => void;
}

export const usePlayerStore = create<PlayerState>((set) => ({
  player: null,
  avatar: null,
  ships: [],
  inventory: null,
  missions: [],
  crafts: [],
  expedition: null,
  loading: false,
  error: null,

  setPlayer: (player) => set({ player }),
  setAvatar: (avatar) => set({ avatar }),
  setShips: (ships) => set({ ships }),
  setInventory: (inventory) => set({ inventory }),
  setMissions: (missions) => set({ missions }),
  setCrafts: (crafts) => set({ crafts }),
  setExpedition: (expedition) => set({ expedition }),

  async refreshPlayer() {
    const { player } = await api.get<{ player: PlayerDto }>('/api/player');
    set({ player });
  },

  async refreshShips() {
    const { ships } = await api.get<{ ships: ShipDto[] }>('/api/ships');
    set({ ships });
  },

  async refreshInventory() {
    const { inventory } = await api.get<{ inventory: InventoryDto }>('/api/inventory');
    set({ inventory });
  },

  async refreshMissions() {
    const { active } = await api.get<{ active: ActiveMissionDto[] }>('/api/missions');
    set({ missions: active });
  },

  async refreshCrafts() {
    const { active } = await api.get<{ active: CraftDto[] }>('/api/crafting');
    set({ crafts: active });
  },

  async refreshExpedition() {
    const { expedition } = await api.get<{ expedition: ExpeditionDto | null }>(
      '/api/mining/expedition',
    );
    set({ expedition });
  },

  async refreshAll() {
    set({ loading: true, error: null });
    try {
      const [player, avatar, ships, inventory, missions, crafting, expedition] = await Promise.all([
        api.get<{ player: PlayerDto }>('/api/player'),
        api.get<{ avatar: AvatarStateDto }>('/api/player/avatar'),
        api.get<{ ships: ShipDto[] }>('/api/ships'),
        api.get<{ inventory: InventoryDto }>('/api/inventory'),
        api.get<{ active: ActiveMissionDto[] }>('/api/missions'),
        api.get<{ active: CraftDto[] }>('/api/crafting'),
        api.get<{ expedition: ExpeditionDto | null }>('/api/mining/expedition'),
      ]);
      set({
        player: player.player,
        avatar: avatar.avatar,
        ships: ships.ships,
        inventory: inventory.inventory,
        missions: missions.active,
        crafts: crafting.active,
        expedition: expedition.expedition,
        loading: false,
      });
    } catch (error) {
      set({
        loading: false,
        error: error instanceof Error ? error.message : 'Failed to load player state.',
      });
      throw error;
    }
  },

  reset: () =>
    set({
      player: null,
      avatar: null,
      ships: [],
      inventory: null,
      missions: [],
      crafts: [],
      expedition: null,
      error: null,
    }),
}));

/** The hull the player is currently flying, if any. */
export function activeShip(): ShipDto | null {
  return usePlayerStore.getState().ships.find((ship) => ship.active) ?? null;
}
