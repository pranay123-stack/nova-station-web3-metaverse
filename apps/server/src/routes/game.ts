import type { FastifyInstance } from 'fastify';
import {
  MINING_ZONES,
  RECIPES,
  RESOURCES,
  SHIPS,
  type ResourceId,
  type ShipStats,
} from '@nova/game-data';
import {
  abandonMissionSchema,
  acceptMissionSchema,
  buyShipSchema,
  claimMissionSchema,
  collectCraftSchema,
  equipItemSchema,
  equipModuleSchema,
  extractSchema,
  inventoryQuerySchema,
  refineSchema,
  refuelSchema,
  renameShipSchema,
  returnExpeditionSchema,
  scanSchema,
  selectShipSchema,
  startCraftSchema,
  startExpeditionSchema,
  unequipModuleSchema,
  upgradeShipSchema,
  type InventoryDto,
  type InventoryEntryDto,
} from '@nova/shared';
import { canUpgrade, describeItem, upgradeCost } from '@nova/game-engine';
import { prisma } from '../db/client.js';
import { auth, parse } from './context.js';
import {
  activeShip,
  buyShip,
  equipModule,
  listShips,
  refuel,
  renameShip,
  selectShip,
  unequipModule,
  upgradeShip,
} from '../services/ships.js';
import { setEquipped } from '../services/inventory.js';
import {
  abandonMission,
  acceptMission,
  activeMissions,
  claimMission,
  missionBoard,
} from '../services/missions.js';
import {
  currentExpedition,
  expeditionCost,
  extract,
  refine,
  returnExpedition,
  scanNode,
  startExpedition,
} from '../services/mining.js';
import { activeCrafts, collectCraft, startCraft } from '../services/crafting.js';
import { playerDto } from '../services/player.js';

export async function gameRoutes(app: FastifyInstance): Promise<void> {
  /* ----------------------------------------------------------- inventory */

  app.get('/api/inventory', async (request) => {
    const user = auth(request);
    const query = parse(inventoryQuerySchema, request.query);
    const db = prisma();

    const [rows, player, ship, onChain] = await Promise.all([
      db.inventoryItem.findMany({
        where: {
          userId: user.userId,
          amount: { gt: 0 },
          ...(query.kind ? { kind: query.kind } : {}),
        },
        orderBy: [{ kind: 'asc' }, { defId: 'asc' }],
        select: { kind: true, defId: true, amount: true, equipped: true },
      }),
      db.user.findUniqueOrThrow({ where: { id: user.userId }, select: { credits: true } }),
      activeShip(db, user.userId),
      db.blockchainAsset.findMany({
        where: { owner: user.address },
        select: { defId: true, amount: true },
      }),
    ]);

    const onChainByDef = new Map<string, number>();
    for (const asset of onChain) {
      onChainByDef.set(asset.defId, (onChainByDef.get(asset.defId) ?? 0) + Number(asset.amount));
    }

    let entries: InventoryEntryDto[] = rows.map((row) => {
      const info = describeItem({
        kind: row.kind as 'resource' | 'module' | 'equipment' | 'cosmetic',
        id: row.defId,
      });
      return {
        kind: row.kind as InventoryEntryDto['kind'],
        defId: row.defId,
        name: info?.name ?? row.defId,
        rarity: info?.rarity ?? 'common',
        amount: row.amount,
        equipped: row.equipped,
        value: info?.baseValue ?? 0,
        onChainAmount: onChainByDef.get(row.defId) ?? 0,
      };
    });

    if (query.search) {
      const needle = query.search.toLowerCase();
      entries = entries.filter(
        (entry) =>
          entry.name.toLowerCase().includes(needle) || entry.defId.includes(needle),
      );
    }

    const cargoUsed = entries
      .filter((entry) => entry.kind === 'resource')
      .reduce((sum, entry) => sum + RESOURCES[entry.defId as ResourceId].weight * entry.amount, 0);

    const inventory: InventoryDto = {
      credits: Number(player.credits),
      cargoUsed: Math.round(cargoUsed * 100) / 100,
      cargoCapacity: ship?.stats.cargo ?? 0,
      entries,
    };
    return { inventory };
  });

  app.post('/api/inventory/equip', async (request) => {
    const user = auth(request);
    const body = parse(equipItemSchema, request.body);
    await setEquipped(prisma(), user.userId, body.kind, body.defId, true);
    return { ok: true };
  });

  app.post('/api/inventory/unequip', async (request) => {
    const user = auth(request);
    const body = parse(equipItemSchema, request.body);
    await setEquipped(prisma(), user.userId, body.kind, body.defId, false);
    return { ok: true };
  });

  /* --------------------------------------------------------------- ships */

  app.get('/api/ships', async (request) => {
    const user = auth(request);
    const ships = await listShips(prisma(), user.userId);
    return { ships, catalogue: SHIPS };
  });

  app.post('/api/ships/select', async (request) => {
    const user = auth(request);
    const body = parse(selectShipSchema, request.body);
    return { ship: await selectShip(prisma(), user.userId, body.shipId) };
  });

  app.post('/api/ships/rename', async (request) => {
    const user = auth(request);
    const body = parse(renameShipSchema, request.body);
    return { ship: await renameShip(prisma(), user.userId, body.shipId, body.name) };
  });

  app.post('/api/ships/buy', async (request) => {
    const user = auth(request);
    const body = parse(buyShipSchema, request.body);
    const ship = await buyShip(prisma(), user.userId, body.defId);
    return { ship, player: await playerDto(prisma(), user.userId) };
  });

  app.post('/api/ships/upgrade', async (request) => {
    const user = auth(request);
    const body = parse(upgradeShipSchema, request.body);
    const result = await upgradeShip(prisma(), user.userId, body.shipId, body.stat);
    return { ...result, player: await playerDto(prisma(), user.userId) };
  });

  /** Quotes every upgrade for a hull, so the hangar shows real prices. */
  app.get('/api/ships/:shipId/upgrades', async (request) => {
    const user = auth(request);
    const params = request.params as { shipId: string };
    const ships = await listShips(prisma(), user.userId);
    const ship = ships.find((entry) => entry.id === params.shipId);
    if (!ship) return { upgrades: [] };

    const stats: (keyof ShipStats)[] = ['speed', 'cargo', 'fuel', 'miningPower', 'defense', 'sensors'];
    return {
      upgrades: stats.map((stat) => {
        const tier = ship.upgrades[stat] ?? 0;
        return {
          stat,
          tier,
          canUpgrade: canUpgrade(tier),
          cost: upgradeCost(tier, stat),
        };
      }),
    };
  });

  app.post('/api/ships/equip', async (request) => {
    const user = auth(request);
    const body = parse(equipModuleSchema, request.body);
    return {
      ship: await equipModule(prisma(), user.userId, body.shipId, body.moduleId, body.slotIndex),
    };
  });

  app.post('/api/ships/unequip', async (request) => {
    const user = auth(request);
    const body = parse(unequipModuleSchema, request.body);
    return { ship: await unequipModule(prisma(), user.userId, body.shipId, body.slotIndex) };
  });

  app.post('/api/ships/refuel', async (request) => {
    const user = auth(request);
    const body = parse(refuelSchema, request.body);
    const result = await refuel(prisma(), user.userId, body.shipId, body.amount);
    return { ...result, player: await playerDto(prisma(), user.userId) };
  });

  /* ------------------------------------------------------------ missions */

  app.get('/api/missions', async (request) => {
    const user = auth(request);
    const query = request.query as { faction?: string };
    const db = prisma();
    const [board, active] = await Promise.all([
      missionBoard(db, user.userId, query.faction as never),
      activeMissions(db, user.userId),
    ]);
    return { board, active };
  });

  app.post('/api/missions/accept', async (request) => {
    const user = auth(request);
    const body = parse(acceptMissionSchema, request.body);
    return { mission: await acceptMission(prisma(), user.userId, body.missionId) };
  });

  app.post('/api/missions/abandon', async (request) => {
    const user = auth(request);
    const body = parse(abandonMissionSchema, request.body);
    await abandonMission(prisma(), user.userId, body.playerMissionId);
    return { ok: true };
  });

  app.post('/api/missions/claim', async (request) => {
    const user = auth(request);
    const body = parse(claimMissionSchema, request.body);
    const result = await claimMission(prisma(), user.userId, body.playerMissionId);
    return { reward: result, player: await playerDto(prisma(), user.userId) };
  });

  /* -------------------------------------------------------------- mining */

  app.get('/api/mining/zones', async (request) => {
    const user = auth(request);
    const db = prisma();
    const ship = await activeShip(db, user.userId);
    return {
      zones: MINING_ZONES.map((zone) => ({
        ...zone,
        cost: ship ? expeditionCost(zone.id, ship.stats) : null,
      })),
      expedition: await currentExpedition(db, user.userId),
    };
  });

  app.post('/api/mining/launch', async (request) => {
    const user = auth(request);
    const body = parse(startExpeditionSchema, request.body);
    return {
      expedition: await startExpedition(prisma(), user.userId, body.zoneId, body.shipId),
    };
  });

  app.get('/api/mining/expedition', async (request) => {
    const user = auth(request);
    return { expedition: await currentExpedition(prisma(), user.userId) };
  });

  app.post('/api/mining/extract', async (request) => {
    const user = auth(request);
    const body = parse(extractSchema, request.body);
    const result = await extract(
      prisma(),
      user.userId,
      body.expeditionId,
      body.nodeIndex,
      body.holdTicks,
    );
    return { result };
  });

  app.post('/api/mining/scan', async (request) => {
    const user = auth(request);
    const body = parse(scanSchema, request.body);
    return await scanNode(prisma(), user.userId, body.expeditionId, body.nodeIndex);
  });

  app.post('/api/mining/return', async (request) => {
    const user = auth(request);
    const body = parse(returnExpeditionSchema, request.body);
    const result = await returnExpedition(prisma(), user.userId, body.expeditionId);
    return { result, player: await playerDto(prisma(), user.userId) };
  });

  app.post('/api/mining/refine', async (request) => {
    const user = auth(request);
    const body = parse(refineSchema, request.body);
    const result = await refine(
      prisma(),
      user.userId,
      body.batch as { resource: ResourceId; amount: number }[],
    );
    return { result, player: await playerDto(prisma(), user.userId) };
  });

  /* ------------------------------------------------------------ crafting */

  app.get('/api/crafting', async (request) => {
    const user = auth(request);
    return { recipes: RECIPES, active: await activeCrafts(prisma(), user.userId) };
  });

  app.post('/api/crafting/start', async (request) => {
    const user = auth(request);
    const body = parse(startCraftSchema, request.body);
    // The bench is at the Lab; the recipe's own `station` field is the check.
    const craft = await startCraft(prisma(), user.userId, body.recipeId, 'lab');
    return { craft, player: await playerDto(prisma(), user.userId) };
  });

  app.post('/api/crafting/collect', async (request) => {
    const user = auth(request);
    const body = parse(collectCraftSchema, request.body);
    const result = await collectCraft(prisma(), user.userId, body.craftId);
    return { result, player: await playerDto(prisma(), user.userId) };
  });
}
