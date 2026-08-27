import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MINING_MINIGAME, RECIPES_BY_ID } from '@nova/game-data';
import {
  api,
  giveCredits,
  giveResources,
  resetDatabase,
  setLevel,
  setReputation,
  signIn,
  testApp,
  type TestPlayer,
} from './helpers.js';
import { prisma } from '../src/db/client.js';
import { replayBalance } from '../src/services/ledger.js';

interface PlayerBody {
  player: { credits: number; level: number; xp: number; stats: { resourcesMined: number } };
}

async function credits(player: TestPlayer): Promise<number> {
  const { body } = await api<PlayerBody>(player, 'GET', '/api/player');
  return body.player.credits;
}

describe('gameplay loop', () => {
  let player: TestPlayer;

  beforeAll(async () => {
    await testApp();
  });

  beforeEach(async () => {
    await resetDatabase();
    player = await signIn(21);
  });

  /* ------------------------------------------------------------- ships */

  it('starts the player with an active Kestrel', async () => {
    const { body } = await api<{ ships: { defId: string; active: boolean; fuel: number }[] }>(
      player,
      'GET',
      '/api/ships',
    );
    expect(body.ships).toHaveLength(1);
    expect(body.ships[0]?.defId).toBe('kestrel');
    expect(body.ships[0]?.active).toBe(true);
    expect(body.ships[0]?.fuel).toBeGreaterThan(0);
  });

  it('refuses to buy a hull the player cannot afford', async () => {
    await setLevel(player.userId, 10);
    const { status, body } = await api<{ error: { code: string } }>(
      player,
      'POST',
      '/api/ships/buy',
      { defId: 'pickaxe' },
    );
    expect(status).toBe(400);
    expect(body.error.code).toBe('insufficient_credits');
  });

  it('refuses to buy a hull above the player level', async () => {
    await giveCredits(player.userId, 1_000_000);
    const { status, body } = await api<{ error: { code: string } }>(
      player,
      'POST',
      '/api/ships/buy',
      { defId: 'mule' },
    );
    expect(status).toBe(403);
    expect(body.error.code).toBe('insufficient_level');
  });

  it('refuses to buy a hull that is not sold for credits', async () => {
    await setLevel(player.userId, 30);
    await giveCredits(player.userId, 100_000_000);
    const { status } = await api(player, 'POST', '/api/ships/buy', { defId: 'aurora' });
    expect(status).toBe(403);
  });

  it('buys, selects and renames a hull', async () => {
    await setLevel(player.userId, 10);
    await giveCredits(player.userId, 50_000);

    const bought = await api<{ ship: { id: string } }>(player, 'POST', '/api/ships/buy', {
      defId: 'pickaxe',
    });
    expect(bought.status).toBe(200);

    const selected = await api<{ ship: { active: boolean } }>(player, 'POST', '/api/ships/select', {
      shipId: bought.body.ship.id,
    });
    expect(selected.body.ship.active).toBe(true);

    const renamed = await api<{ ship: { name: string } }>(player, 'POST', '/api/ships/rename', {
      shipId: bought.body.ship.id,
      name: 'Ore Hauler',
    });
    expect(renamed.body.ship.name).toBe('Ore Hauler');
  });

  it('rejects a ship name with markup in it', async () => {
    const ships = await api<{ ships: { id: string }[] }>(player, 'GET', '/api/ships');
    const { status } = await api(player, 'POST', '/api/ships/rename', {
      shipId: ships.body.ships[0]?.id,
      name: '<script>alert(1)</script>',
    });
    expect(status).toBe(400);
  });

  it('refuses to operate on a ship belonging to someone else', async () => {
    const other = await signIn(22);
    const theirs = await api<{ ships: { id: string }[] }>(other, 'GET', '/api/ships');
    const shipId = theirs.body.ships[0]?.id;

    expect((await api(player, 'POST', '/api/ships/select', { shipId })).status).toBe(404);
    expect((await api(player, 'POST', '/api/ships/rename', { shipId, name: 'Stolen' })).status).toBe(
      404,
    );
    expect(
      (await api(player, 'POST', '/api/ships/upgrade', { shipId, stat: 'speed' })).status,
    ).toBe(404);
  });

  it('upgrades a ship and charges credits and materials', async () => {
    await giveCredits(player.userId, 50_000);
    await giveResources(player.userId, [
      { defId: 'iron', amount: 500 },
      { defId: 'titanium', amount: 500 },
    ]);
    const ships = await api<{ ships: { id: string; stats: { speed: number } }[] }>(
      player,
      'GET',
      '/api/ships',
    );
    const ship = ships.body.ships[0]!;
    const before = await credits(player);

    const upgraded = await api<{
      ship: { stats: { speed: number } };
      spentCredits: number;
      newTier: number;
    }>(player, 'POST', '/api/ships/upgrade', { shipId: ship.id, stat: 'speed' });

    expect(upgraded.status).toBe(200);
    expect(upgraded.body.newTier).toBe(1);
    expect(upgraded.body.ship.stats.speed).toBeGreaterThan(ship.stats.speed);
    expect(await credits(player)).toBe(before - upgraded.body.spentCredits);
  });

  it('refuses an upgrade without the materials', async () => {
    await giveCredits(player.userId, 50_000);
    const ships = await api<{ ships: { id: string }[] }>(player, 'GET', '/api/ships');
    const { status, body } = await api<{ error: { code: string } }>(
      player,
      'POST',
      '/api/ships/upgrade',
      { shipId: ships.body.ships[0]?.id, stat: 'speed' },
    );
    expect(status).toBe(400);
    expect(body.error.code).toBe('insufficient_resources');
  });

  /* ---------------------------------------------------------- missions */

  it('lists a mission board that explains why a mission is unavailable', async () => {
    const { body } = await api<{
      board: { mission: { id: string }; available: boolean; reason: string | null }[];
    }>(player, 'GET', '/api/missions');
    const locked = body.board.find((entry) => entry.mission.id === 'deep_field_charting');
    expect(locked?.available).toBe(false);
    expect(locked?.reason).toBeTruthy();
  });

  it('refuses a mission above the player level', async () => {
    const { status, body } = await api<{ error: { code: string } }>(
      player,
      'POST',
      '/api/missions/accept',
      { missionId: 'deep_field_charting' },
    );
    expect(status).toBe(403);
    expect(body.error.code).toBe('insufficient_level');
  });

  it('accepts a mission and refuses to accept it twice', async () => {
    const first = await api(player, 'POST', '/api/missions/accept', { missionId: 'first_haul' });
    expect(first.status).toBe(200);
    const second = await api(player, 'POST', '/api/missions/accept', { missionId: 'first_haul' });
    expect(second.status).toBe(409);
  });

  it('refuses to claim a mission that is not complete', async () => {
    const accepted = await api<{ mission: { id: string } }>(
      player,
      'POST',
      '/api/missions/accept',
      { missionId: 'first_haul' },
    );
    const { status, body } = await api<{ error: { code: string } }>(
      player,
      'POST',
      '/api/missions/claim',
      { playerMissionId: accepted.body.mission.id },
    );
    expect(status).toBe(409);
    expect(body.error.code).toBe('not_active');
  });

  it('completes the orientation mission by visiting the command deck', async () => {
    await setLevel(player.userId, 10);
    const accepted = await api<{ mission: { id: string } }>(
      player,
      'POST',
      '/api/missions/accept',
      { missionId: 'station_orientation' },
    );

    const visit = await api(player, 'POST', '/api/player/area', {
      area: 'command_deck',
      position: { x: 0, y: 7, z: -140 },
    });
    expect(visit.status).toBe(200);

    const before = await credits(player);
    const claim = await api<{ reward: { credits: number; xp: number } }>(
      player,
      'POST',
      '/api/missions/claim',
      { playerMissionId: accepted.body.mission.id },
    );
    expect(claim.status).toBe(200);
    expect(claim.body.reward.credits).toBeGreaterThan(0);
    expect(await credits(player)).toBe(before + claim.body.reward.credits);
  });

  it('refuses to claim the same mission reward twice', async () => {
    await setLevel(player.userId, 10);
    const accepted = await api<{ mission: { id: string } }>(
      player,
      'POST',
      '/api/missions/accept',
      { missionId: 'station_orientation' },
    );
    await api(player, 'POST', '/api/player/area', {
      area: 'command_deck',
      position: { x: 0, y: 7, z: -140 },
    });

    const first = await api(player, 'POST', '/api/missions/claim', {
      playerMissionId: accepted.body.mission.id,
    });
    expect(first.status).toBe(200);

    const second = await api(player, 'POST', '/api/missions/claim', {
      playerMissionId: accepted.body.mission.id,
    });
    expect(second.status).toBe(409);
  });

  it('refuses to claim another player mission', async () => {
    await setLevel(player.userId, 10);
    const accepted = await api<{ mission: { id: string } }>(
      player,
      'POST',
      '/api/missions/accept',
      { missionId: 'station_orientation' },
    );
    const attacker = await signIn(23);
    const { status } = await api(attacker, 'POST', '/api/missions/claim', {
      playerMissionId: accepted.body.mission.id,
    });
    expect(status).toBe(404);
  });

  /* ------------------------------------------------------------ mining */

  it('runs a full expedition: launch, extract, return', async () => {
    const ships = await api<{ ships: { id: string }[] }>(player, 'GET', '/api/ships');
    const shipId = ships.body.ships[0]!.id;

    const launch = await api<{ expedition: { id: string; fieldSeed: number } }>(
      player,
      'POST',
      '/api/mining/launch',
      { zoneId: 'nova_belt', shipId },
    );
    expect(launch.status).toBe(200);
    expect(launch.body.expedition.fieldSeed).toBeGreaterThanOrEqual(0);

    // Mining before arrival is refused, which is what the travel leg is for.
    const early = await api<{ error: { code: string } }>(player, 'POST', '/api/mining/extract', {
      expeditionId: launch.body.expedition.id,
      nodeIndex: 0,
      holdTicks: 10,
    });
    expect(early.status).toBe(409);
    expect(early.body.error.code).toBe('invalid_state');

    // Land the ship by winding the arrival time back.
    await prisma().expedition.update({
      where: { id: launch.body.expedition.id },
      data: { arrivesAt: new Date(Date.now() - 1000), status: 'active' },
    });

    const extracted = await api<{ result: { yields: { amount: number }[] } }>(
      player,
      'POST',
      '/api/mining/extract',
      {
        expeditionId: launch.body.expedition.id,
        nodeIndex: 0,
        holdTicks: MINING_MINIGAME.extractSec * MINING_MINIGAME.tickHz,
      },
    );
    expect(extracted.status).toBe(200);
    expect(extracted.body.result.yields.length).toBeGreaterThan(0);

    const returned = await api<{ result: { haul: { amount: number }[] } }>(
      player,
      'POST',
      '/api/mining/return',
      { expeditionId: launch.body.expedition.id },
    );
    expect(returned.status).toBe(200);

    const inventory = await api<{ inventory: { entries: { kind: string }[] } }>(
      player,
      'GET',
      '/api/inventory',
    );
    expect(inventory.body.inventory.entries.some((entry) => entry.kind === 'resource')).toBe(true);

    const { body } = await api<PlayerBody>(player, 'GET', '/api/player');
    expect(body.player.stats.resourcesMined).toBeGreaterThan(0);
  });

  it('refuses two expeditions at once', async () => {
    const ships = await api<{ ships: { id: string }[] }>(player, 'GET', '/api/ships');
    const shipId = ships.body.ships[0]!.id;
    await api(player, 'POST', '/api/mining/launch', { zoneId: 'nova_belt', shipId });
    const second = await api<{ error: { code: string } }>(player, 'POST', '/api/mining/launch', {
      zoneId: 'nova_belt',
      shipId,
    });
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('busy');
  });

  it('refuses a zone above the player level', async () => {
    const ships = await api<{ ships: { id: string }[] }>(player, 'GET', '/api/ships');
    const { status } = await api(player, 'POST', '/api/mining/launch', {
      zoneId: 'the_rift',
      shipId: ships.body.ships[0]?.id,
    });
    expect(status).toBe(403);
  });

  it('refuses a zone the player has no standing for', async () => {
    await setLevel(player.userId, 30);
    const ships = await api<{ ships: { id: string }[] }>(player, 'GET', '/api/ships');
    const { status, body } = await api<{ error: { code: string } }>(
      player,
      'POST',
      '/api/mining/launch',
      { zoneId: 'the_rift', shipId: ships.body.ships[0]?.id },
    );
    expect(status).toBe(403);
    expect(body.error.code).toBe('insufficient_reputation');
  });

  it('refines ore into credits and consumes it', async () => {
    await giveResources(player.userId, [{ defId: 'iron', amount: 200 }]);
    const before = await credits(player);

    const { status, body } = await api<{ result: { credits: number; unitsProcessed: number } }>(
      player,
      'POST',
      '/api/mining/refine',
      { batch: [{ resource: 'iron', amount: 200 }] },
    );
    expect(status).toBe(200);
    expect(body.result.unitsProcessed).toBe(200);
    expect(await credits(player)).toBe(before + body.result.credits);

    const inventory = await api<{ inventory: { entries: { defId: string }[] } }>(
      player,
      'GET',
      '/api/inventory',
    );
    expect(inventory.body.inventory.entries.some((entry) => entry.defId === 'iron')).toBe(false);
  });

  it('refuses to refine ore the player does not have', async () => {
    const { status, body } = await api<{ error: { code: string } }>(
      player,
      'POST',
      '/api/mining/refine',
      { batch: [{ resource: 'quantum_shard', amount: 500 }] },
    );
    expect(status).toBe(400);
    expect(body.error.code).toBe('insufficient_resources');
  });

  /* ---------------------------------------------------------- crafting */

  it('crafts an item end to end', async () => {
    await setLevel(player.userId, 10);
    await giveCredits(player.userId, 50_000);
    const recipe = RECIPES_BY_ID.get('recipe_mining_laser_i')!;
    await giveResources(
      player.userId,
      recipe.inputs.map((input) => ({ defId: input.resource, amount: input.amount })),
    );

    const started = await api<{ craft: { id: string } }>(player, 'POST', '/api/crafting/start', {
      recipeId: recipe.id,
    });
    expect(started.status).toBe(200);

    const early = await api<{ error: { code: string } }>(player, 'POST', '/api/crafting/collect', {
      craftId: started.body.craft.id,
    });
    expect(early.status).toBe(409);
    expect(early.body.error.code).toBe('not_active');

    // Wind the bench clock back so the craft is ready.
    await prisma().craftJob.update({
      where: { id: started.body.craft.id },
      data: {
        startedAt: new Date(Date.now() - (recipe.durationSec + 5) * 1000),
        readyAt: new Date(Date.now() - 5000),
      },
    });

    const collected = await api<{ result: { outputId: string; amount: number } }>(
      player,
      'POST',
      '/api/crafting/collect',
      { craftId: started.body.craft.id },
    );
    expect(collected.status).toBe(200);
    expect(collected.body.result.outputId).toBe('mining_laser_i');

    const again = await api(player, 'POST', '/api/crafting/collect', {
      craftId: started.body.craft.id,
    });
    expect(again.status).toBe(409);
  });

  it('refuses a craft without materials and does not charge for it', async () => {
    await setLevel(player.userId, 10);
    await giveCredits(player.userId, 50_000);
    const before = await credits(player);

    const { status } = await api(player, 'POST', '/api/crafting/start', {
      recipeId: 'recipe_mining_laser_i',
    });
    expect(status).toBe(400);
    expect(await credits(player)).toBe(before);
  });

  it('refuses a craft gated behind faction standing', async () => {
    await setLevel(player.userId, 30);
    await giveCredits(player.userId, 1_000_000);
    await giveResources(player.userId, [
      { defId: 'platinum', amount: 999 },
      { defId: 'crystal', amount: 999 },
      { defId: 'helium3', amount: 999 },
      { defId: 'quantum_shard', amount: 999 },
    ]);
    const { status, body } = await api<{ error: { code: string } }>(
      player,
      'POST',
      '/api/crafting/start',
      { recipeId: 'recipe_harmonic_extractor' },
    );
    expect(status).toBe(403);
    expect(body.error.code).toBe('insufficient_reputation');
  });

  it('allows the gated craft once standing is earned', async () => {
    await setLevel(player.userId, 30);
    await setReputation(player.userId, 'federation', 4000);
    await giveCredits(player.userId, 1_000_000);
    await giveResources(player.userId, [
      { defId: 'platinum', amount: 999 },
      { defId: 'crystal', amount: 999 },
      { defId: 'helium3', amount: 999 },
      { defId: 'quantum_shard', amount: 999 },
    ]);
    const { status } = await api(player, 'POST', '/api/crafting/start', {
      recipeId: 'recipe_harmonic_extractor',
    });
    expect(status).toBe(200);
  });

  /* ------------------------------------------------------------ ledger */

  it('keeps the cached balance equal to the ledger at every step', async () => {
    await giveResources(player.userId, [{ defId: 'iron', amount: 400 }]);
    await api(player, 'POST', '/api/mining/refine', {
      batch: [{ resource: 'iron', amount: 200 }],
    });
    await api(player, 'POST', '/api/marketplace/broker/sell', { resource: 'iron', amount: 100 });

    const db = prisma();
    const user = await db.user.findUniqueOrThrow({
      where: { id: player.userId },
      select: { credits: true },
    });
    const replayed = await replayBalance(db, player.userId);
    expect(replayed).toBe(user.credits);
  });
});
