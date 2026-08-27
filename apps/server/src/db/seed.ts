import 'dotenv/config';
import {
  ACHIEVEMENTS,
  FACTIONS,
  FACTION_IDS,
  MISSIONS,
  RESOURCES,
  RESOURCE_IDS,
  STATION_AREAS,
  STATION_AREA_IDS,
  type StationAreaId,
} from '@nova/game-data';
import { prisma, disconnectPrisma } from './client.js';
import { logger } from '../logger.js';

/**
 * Mirrors the static game catalogues into the database.
 *
 * The catalogues in `@nova/game-data` remain the source of truth — these rows
 * exist so that player records can carry real foreign keys and so analytics can
 * join against readable names. The seed is idempotent: running it after a
 * content change updates the rows in place.
 */
async function main(): Promise<void> {
  const db = prisma();

  for (const id of RESOURCE_IDS) {
    const resource = RESOURCES[id];
    await db.resource.upsert({
      where: { id: resource.id },
      create: {
        id: resource.id,
        name: resource.name,
        rarity: resource.rarity,
        baseValue: resource.baseValue,
        weight: resource.weight,
      },
      update: {
        name: resource.name,
        rarity: resource.rarity,
        baseValue: resource.baseValue,
        weight: resource.weight,
      },
    });
  }

  for (const id of FACTION_IDS) {
    const faction = FACTIONS[id];
    await db.faction.upsert({
      where: { id: faction.id },
      create: { id: faction.id, name: faction.name, motto: faction.motto },
      update: { name: faction.name, motto: faction.motto },
    });
  }

  for (const mission of MISSIONS) {
    await db.mission.upsert({
      where: { id: mission.id },
      create: {
        id: mission.id,
        code: mission.code,
        title: mission.title,
        type: mission.type,
        difficulty: mission.difficulty,
        faction: mission.faction,
      },
      update: {
        code: mission.code,
        title: mission.title,
        type: mission.type,
        difficulty: mission.difficulty,
        faction: mission.faction,
      },
    });
  }

  for (const achievement of ACHIEVEMENTS) {
    await db.achievement.upsert({
      where: { id: achievement.id },
      create: {
        id: achievement.id,
        name: achievement.name,
        description: achievement.description,
        points: achievement.points,
      },
      update: {
        name: achievement.name,
        description: achievement.description,
        points: achievement.points,
      },
    });
  }

  for (const id of STATION_AREA_IDS) {
    if (id === 'corridor') continue;
    const area = STATION_AREAS[id as Exclude<StationAreaId, 'corridor'>];
    await db.stationArea.upsert({
      where: { id: area.id },
      create: { id: area.id, name: area.name, requiredLevel: area.requiredLevel },
      update: { name: area.name, requiredLevel: area.requiredLevel },
    });
  }

  logger.info(
    {
      resources: RESOURCE_IDS.length,
      factions: FACTION_IDS.length,
      missions: MISSIONS.length,
      achievements: ACHIEVEMENTS.length,
      areas: STATION_AREA_IDS.length - 1,
    },
    'seeded reference data',
  );
}

main()
  .catch((error) => {
    logger.error({ err: error }, 'seed failed');
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectPrisma();
  });
