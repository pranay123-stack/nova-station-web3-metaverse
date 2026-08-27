import type { FastifyInstance } from 'fastify';
import {
  ACHIEVEMENTS,
  FACTIONS,
  FACTION_IDS,
  MISSIONS_BY_ID,
  STATION_AREAS,
  type StationAreaId,
} from '@nova/game-data';
import {
  GameError,
  avatarSchema,
  enterAreaSchema,
  interactSchema,
  leaderboardQuerySchema,
  profileParamsSchema,
  type AchievementDto,
  type LeaderboardRowDto,
} from '@nova/shared';
import { INTERACTABLES_BY_ID } from '@nova/game-data';
import { distance2D } from '@nova/game-engine';
import { prisma } from '../db/client.js';
import { playerDto } from '../services/player.js';
import { areaUnlockLevel, readStanding, standingRankNames, standingRanks } from '../services/progression.js';
import { events, recordEvent } from '../services/events.js';
import { listShips } from '../services/ships.js';
import { auth, parse } from './context.js';

export async function playerRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/player', async (request) => {
    const user = auth(request);
    return { player: await playerDto(prisma(), user.userId) };
  });

  app.get('/api/player/achievements', async (request) => {
    const user = auth(request);
    const db = prisma();
    const [row, unlocked] = await Promise.all([
      db.user.findUniqueOrThrow({
        where: { id: user.userId },
        select: {
          level: true,
          missionsCompleted: true,
          resourcesMined: true,
          creditsEarned: true,
          itemsCrafted: true,
          expeditionsDone: true,
          tradesDone: true,
          distanceWalked: true,
        },
      }),
      db.playerAchievement.findMany({
        where: { userId: user.userId },
        select: { achievementId: true, unlockedAt: true },
      }),
    ]);
    const assetCount = await db.blockchainAsset.count({ where: { owner: user.address } });
    const unlockedMap = new Map(unlocked.map((a) => [a.achievementId, a.unlockedAt]));

    const metrics: Record<string, number> = {
      level: row.level,
      missions_completed: row.missionsCompleted,
      resources_mined: Number(row.resourcesMined),
      credits_earned: Number(row.creditsEarned),
      items_crafted: row.itemsCrafted,
      expeditions: row.expeditionsDone,
      trades: row.tradesDone,
      distance_walked: row.distanceWalked,
      assets_owned: assetCount,
    };

    const list: AchievementDto[] = ACHIEVEMENTS.map((achievement) => {
      const at = unlockedMap.get(achievement.id);
      return {
        id: achievement.id,
        name: achievement.name,
        description: achievement.description,
        icon: achievement.icon,
        points: achievement.points,
        unlocked: at !== undefined,
        unlockedAt: at ? at.toISOString() : null,
        progress: Math.min(metrics[achievement.metric] ?? 0, achievement.threshold),
        threshold: achievement.threshold,
      };
    });

    return {
      achievements: list,
      points: list.filter((a) => a.unlocked).reduce((sum, a) => sum + a.points, 0),
    };
  });

  /** Public profile. Readable without a session, by design. */
  app.get('/api/player/profile/:address', async (request) => {
    const { address } = parse(profileParamsSchema, request.params);
    const db = prisma();
    const row = await db.user.findUnique({ where: { address }, select: { id: true } });
    if (!row) throw new GameError('not_found', 'No commander with that address.');

    const [player, ships, achievements, assets] = await Promise.all([
      playerDto(db, row.id),
      listShips(db, row.id),
      db.playerAchievement.count({ where: { userId: row.id } }),
      db.blockchainAsset.count({ where: { owner: address } }),
    ]);

    return {
      player,
      ships: ships.map((ship) => ({
        defId: ship.defId,
        name: ship.name,
        shipClass: ship.shipClass,
        rarity: ship.rarity,
        tokenId: ship.tokenId,
      })),
      achievementsUnlocked: achievements,
      onChainAssets: assets,
    };
  });

  app.put('/api/player/avatar', async (request) => {
    const user = auth(request);
    const body = parse(avatarSchema, request.body);
    const db = prisma();

    // Cosmetics must be owned before they can be worn. Without this check the
    // avatar editor becomes a free-item dispenser.
    const owned = await db.inventoryItem.findMany({
      where: {
        userId: user.userId,
        kind: { in: ['cosmetic', 'equipment'] },
        amount: { gt: 0 },
      },
      select: { defId: true },
    });
    const have = new Set(owned.map((row) => row.defId));
    for (const defId of [
      body.suitId,
      body.helmetId,
      body.suitPattern,
      body.visor,
      body.emblem,
      body.accessory,
    ]) {
      if (!have.has(defId)) {
        throw new GameError('not_owned', `You do not own ${defId}.`);
      }
    }

    await db.$transaction(async (tx) => {
      await tx.avatar.upsert({
        where: { userId: user.userId },
        create: { userId: user.userId, ...stripName(body) },
        update: stripName(body),
      });
      await tx.user.update({
        where: { id: user.userId },
        data: { displayName: body.displayName },
      });
    });

    return { avatar: body };
  });

  app.get('/api/player/avatar', async (request) => {
    const user = auth(request);
    const db = prisma();
    const [avatar, row] = await Promise.all([
      db.avatar.findUnique({ where: { userId: user.userId } }),
      db.user.findUniqueOrThrow({ where: { id: user.userId }, select: { displayName: true } }),
    ]);
    if (!avatar) throw new GameError('not_found', 'No avatar for this player.');
    return {
      avatar: {
        displayName: row.displayName,
        suitId: avatar.suitId,
        helmetId: avatar.helmetId,
        suitPattern: avatar.suitPattern,
        visor: avatar.visor,
        emblem: avatar.emblem,
        accessory: avatar.accessory,
        primaryColor: avatar.primaryColor,
        secondaryColor: avatar.secondaryColor,
      },
    };
  });

  /**
   * Records that a player entered an area.
   *
   * The claimed position is checked against the area's own rectangle and the
   * area's level gate, so this cannot be used to tick off a "visit the command
   * deck" objective from the habitat.
   */
  app.post('/api/player/area', async (request) => {
    const user = auth(request);
    const body = parse(enterAreaSchema, request.body);
    const db = prisma();

    if (body.area === 'corridor') return { ok: true };
    const area = STATION_AREAS[body.area as Exclude<StationAreaId, 'corridor'>];
    if (!area) throw new GameError('not_found', 'No such area.');

    const player = await db.user.findUniqueOrThrow({
      where: { id: user.userId },
      select: { level: true },
    });
    if (player.level < areaUnlockLevel(body.area as StationAreaId)) {
      throw new GameError('area_locked', `${area.name} unlocks at level ${area.requiredLevel}.`);
    }

    const [cx, , cz] = area.center;
    const [hx, hz] = area.halfExtents;
    const inside =
      Math.abs(body.position.x - cx) <= hx + 2 && Math.abs(body.position.z - cz) <= hz + 2;
    if (!inside) {
      throw new GameError('too_far_away', 'You are not in that area.');
    }

    await db.areaVisit.upsert({
      where: { userId_areaId: { userId: user.userId, areaId: area.id } },
      create: { userId: user.userId, areaId: area.id },
      update: { visits: { increment: 1 }, lastVisitedAt: new Date() },
    });
    await recordEvent(db, user.userId, events.visited(body.area as StationAreaId));

    return { ok: true };
  });

  /** Confirms a terminal interaction, checked against the interactable's radius. */
  app.post('/api/player/interact', async (request) => {
    const user = auth(request);
    const body = parse(interactSchema, request.body);
    const target = INTERACTABLES_BY_ID.get(body.interactableId);
    if (!target) throw new GameError('not_found', 'No such terminal.');

    const distance = distance2D(
      body.position.x,
      body.position.z,
      target.position[0],
      target.position[2],
    );
    if (distance > target.radius + 1.5) {
      throw new GameError('too_far_away', 'Move closer to use that terminal.');
    }

    const db = prisma();
    if (target.area !== 'corridor') {
      await recordEvent(db, user.userId, events.visited(target.area));
    }
    return { ok: true, interactable: target };
  });

  app.get('/api/factions', async (request) => {
    const user = auth(request);
    const standing = await readStanding(prisma(), user.userId);
    const ranks = standingRanks(standing);
    const names = standingRankNames(standing);
    return {
      factions: FACTION_IDS.map((id) => ({
        ...FACTIONS[id],
        reputation: standing[id],
        rank: ranks[id],
        rankName: names[id],
      })),
    };
  });

  app.get('/api/leaderboard', async (request) => {
    const query = parse(leaderboardQuerySchema, request.query);
    const db = prisma();

    if (query.metric === 'reputation') {
      const rows = await db.playerFaction.findMany({
        where: query.faction ? { factionId: query.faction } : {},
        orderBy: { reputation: 'desc' },
        take: query.limit,
        select: {
          reputation: true,
          user: { select: { address: true, displayName: true, level: true, primaryFaction: true } },
        },
      });
      const list: LeaderboardRowDto[] = rows.map((row, index) => ({
        rank: index + 1,
        address: row.user.address,
        displayName: row.user.displayName,
        level: row.user.level,
        value: row.reputation,
        faction: (row.user.primaryFaction as LeaderboardRowDto['faction']) ?? null,
      }));
      return { metric: query.metric, rows: list };
    }

    const orderBy =
      query.metric === 'credits'
        ? { credits: 'desc' as const }
        : query.metric === 'missions'
          ? { missionsCompleted: 'desc' as const }
          : query.metric === 'mined'
            ? { resourcesMined: 'desc' as const }
            : { xp: 'desc' as const };

    const rows = await db.user.findMany({
      orderBy,
      take: query.limit,
      select: {
        address: true,
        displayName: true,
        level: true,
        xp: true,
        credits: true,
        missionsCompleted: true,
        resourcesMined: true,
        primaryFaction: true,
      },
    });

    const list: LeaderboardRowDto[] = rows.map((row, index) => ({
      rank: index + 1,
      address: row.address,
      displayName: row.displayName,
      level: row.level,
      value:
        query.metric === 'credits'
          ? Number(row.credits)
          : query.metric === 'missions'
            ? row.missionsCompleted
            : query.metric === 'mined'
              ? Number(row.resourcesMined)
              : row.xp,
      faction: (row.primaryFaction as LeaderboardRowDto['faction']) ?? null,
    }));

    return { metric: query.metric, rows: list };
  });

  /** Static content the client needs but should not hardcode. */
  app.get('/api/station', async () => ({
    areas: Object.values(STATION_AREAS),
    missionCount: MISSIONS_BY_ID.size,
  }));
}

function stripName(body: { displayName: string } & Record<string, unknown>) {
  const { displayName: _ignored, ...rest } = body;
  return rest as {
    suitId: string;
    helmetId: string;
    suitPattern: string;
    visor: string;
    emblem: string;
    accessory: string;
    primaryColor: string;
    secondaryColor: string;
  };
}
