import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MINING_MINIGAME } from '@nova/game-data';
import {
  api,
  giveCredits,
  giveResources,
  resetDatabase,
  setLevel,
  signIn,
  testApp,
  type TestPlayer,
} from './helpers.js';
import { prisma } from '../src/db/client.js';
import { replayBalance } from '../src/services/ledger.js';

/**
 * These tests are the client-is-hostile contract.
 *
 * Each one takes a thing a modified client would try — claim a perfect
 * minigame, mine the same rock twice, spend the same ore in two requests, mint
 * an item it does not own — and asserts the server refuses it. They are written
 * against the HTTP surface deliberately: that is the only interface an attacker
 * actually has.
 */

async function creditsOf(userId: string): Promise<bigint> {
  const user = await prisma().user.findUniqueOrThrow({
    where: { id: userId },
    select: { credits: true },
  });
  return user.credits;
}

async function launchAndLand(player: TestPlayer): Promise<string> {
  const ships = await api<{ ships: { id: string }[] }>(player, 'GET', '/api/ships');
  const launch = await api<{ expedition: { id: string } }>(player, 'POST', '/api/mining/launch', {
    zoneId: 'nova_belt',
    shipId: ships.body.ships[0]!.id,
  });
  if (launch.status !== 200) {
    throw new Error(`launch failed: ${launch.status} ${JSON.stringify(launch.body)}`);
  }
  const id = launch.body.expedition.id;
  await prisma().expedition.update({
    where: { id },
    data: { arrivesAt: new Date(Date.now() - 1000), status: 'active' },
  });
  return id;
}

describe('anti-cheat', () => {
  let player: TestPlayer;

  beforeAll(async () => {
    await testApp();
  });
  beforeEach(async () => {
    await resetDatabase();
    player = await signIn(41);
  });

  it('ignores an impossible minigame score', async () => {
    const honestId = await launchAndLand(player);
    const honest = await api<{ result: { yields: { amount: number }[]; multiplier: number } }>(
      player,
      'POST',
      '/api/mining/extract',
      {
        expeditionId: honestId,
        nodeIndex: 0,
        holdTicks: MINING_MINIGAME.extractSec * MINING_MINIGAME.tickHz,
      },
    );
    const honestTotal = honest.body.result.yields.reduce((sum, y) => sum + y.amount, 0);

    await prisma().expedition.updateMany({ data: { status: 'complete' } });
    const cheatId = await launchAndLand(player);

    // A claim far outside the plausible range never reaches the engine: the
    // schema rejects it at the edge of the API.
    const absurd = await api(player, 'POST', '/api/mining/extract', {
      expeditionId: cheatId,
      nodeIndex: 9,
      holdTicks: 5_000_000,
    });
    expect(absurd.status).toBe(400);

    // A claim inside the schema's range but still impossible for the elapsed
    // time is clamped by the engine instead.
    const cheat = await api<{ result: { yields: { amount: number }[]; multiplier: number } }>(
      player,
      'POST',
      '/api/mining/extract',
      { expeditionId: cheatId, nodeIndex: 0, holdTicks: 10_000 },
    );
    expect(cheat.status).toBe(200);

    // A client claiming a superhuman score gets exactly what a perfect human run gets.
    expect(cheat.body.result.multiplier).toBeLessThanOrEqual(MINING_MINIGAME.maxMultiplier);
    expect(cheat.body.result.yields.reduce((sum, y) => sum + y.amount, 0)).toBeLessThanOrEqual(
      honestTotal * 1.2,
    );
  });

  it('rejects a negative or fractional minigame score outright', async () => {
    const expeditionId = await launchAndLand(player);
    for (const holdTicks of [-1, 1.5, Number.NaN, 'lots']) {
      const { status } = await api(player, 'POST', '/api/mining/extract', {
        expeditionId,
        nodeIndex: 1,
        holdTicks,
      });
      expect(status, String(holdTicks)).toBe(400);
    }
  });

  it('refuses to mine the same asteroid twice', async () => {
    const expeditionId = await launchAndLand(player);
    const first = await api(player, 'POST', '/api/mining/extract', {
      expeditionId,
      nodeIndex: 3,
      holdTicks: 60,
    });
    expect(first.status).toBe(200);

    const replay = await api<{ error: { code: string } }>(player, 'POST', '/api/mining/extract', {
      expeditionId,
      nodeIndex: 3,
      holdTicks: 60,
    });
    expect(replay.status).toBe(409);
    expect(replay.body.error.code).toBe('conflict');
  });

  it('refuses to mine someone else expedition', async () => {
    const expeditionId = await launchAndLand(player);
    const attacker = await signIn(42);
    const { status } = await api(attacker, 'POST', '/api/mining/extract', {
      expeditionId,
      nodeIndex: 0,
      holdTicks: 60,
    });
    expect(status).toBe(404);
  });

  it('refuses to bank the same expedition twice', async () => {
    const expeditionId = await launchAndLand(player);
    await api(player, 'POST', '/api/mining/extract', {
      expeditionId,
      nodeIndex: 0,
      holdTicks: 60,
    });

    const first = await api(player, 'POST', '/api/mining/return', { expeditionId });
    expect(first.status).toBe(200);
    const second = await api(player, 'POST', '/api/mining/return', { expeditionId });
    expect(second.status).toBe(409);
  });

  it('never lets a haul exceed the ship cargo capacity', async () => {
    const expeditionId = await launchAndLand(player);
    for (let node = 0; node < 40; node += 1) {
      await api(player, 'POST', '/api/mining/extract', {
        expeditionId,
        nodeIndex: node,
        holdTicks: 200,
      });
    }
    const expedition = await prisma().expedition.findUniqueOrThrow({ where: { id: expeditionId } });
    const ship = await api<{ ships: { stats: { cargo: number } }[] }>(player, 'GET', '/api/ships');
    expect(expedition.cargoUsed).toBeLessThanOrEqual(ship.body.ships[0]!.stats.cargo + 0.01);
  });

  it('cannot spend the same ore in two concurrent refines', async () => {
    await giveResources(player.userId, [{ defId: 'iron', amount: 100 }]);
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        api(player, 'POST', '/api/mining/refine', { batch: [{ resource: 'iron', amount: 100 }] }),
      ),
    );
    const succeeded = results.filter((result) => result.status === 200);
    expect(succeeded).toHaveLength(1);

    const remaining = await prisma().inventoryItem.findFirst({
      where: { userId: player.userId, kind: 'resource', defId: 'iron' },
    });
    expect(remaining?.amount ?? 0).toBe(0);
  });

  it('cannot spend the same credits in two concurrent purchases', async () => {
    await setLevel(player.userId, 10);
    const balance = await creditsOf(player.userId);
    await prisma().user.update({
      where: { id: player.userId },
      data: { credits: 4800n },
    });
    expect(balance).toBeGreaterThanOrEqual(0n);

    const results = await Promise.all(
      Array.from({ length: 4 }, () =>
        api(player, 'POST', '/api/ships/buy', { defId: 'pickaxe' }),
      ),
    );
    expect(results.filter((result) => result.status === 200)).toHaveLength(1);
    expect(await creditsOf(player.userId)).toBe(0n);
  });

  it('never lets a balance go negative, whatever the sequence', async () => {
    await prisma().user.update({ where: { id: player.userId }, data: { credits: 10n } });
    await api(player, 'POST', '/api/marketplace/broker/buy', {
      resource: 'quantum_shard',
      amount: 1000,
    });
    expect(await creditsOf(player.userId)).toBeGreaterThanOrEqual(0n);
  });

  it('keeps the ledger and the cached balance in agreement under concurrency', async () => {
    await giveResources(player.userId, [{ defId: 'iron', amount: 1000 }]);
    await Promise.all(
      Array.from({ length: 8 }, () =>
        api(player, 'POST', '/api/marketplace/broker/sell', { resource: 'iron', amount: 50 }),
      ),
    );
    const db = prisma();
    expect(await replayBalance(db, player.userId)).toBe(await creditsOf(player.userId));
  });

  it('cannot start two crafts from one set of materials', async () => {
    await setLevel(player.userId, 10);
    await giveCredits(player.userId, 100_000);
    await giveResources(player.userId, [
      { defId: 'iron', amount: 30 },
      { defId: 'titanium', amount: 10 },
    ]);

    const results = await Promise.all(
      Array.from({ length: 4 }, () =>
        api(player, 'POST', '/api/crafting/start', { recipeId: 'recipe_mining_laser_i' }),
      ),
    );
    expect(results.filter((result) => result.status === 200)).toHaveLength(1);
  });

  it('cannot collect a craft before it is ready, however many times it asks', async () => {
    await setLevel(player.userId, 10);
    await giveCredits(player.userId, 100_000);
    await giveResources(player.userId, [
      { defId: 'iron', amount: 30 },
      { defId: 'titanium', amount: 10 },
    ]);
    const started = await api<{ craft: { id: string } }>(player, 'POST', '/api/crafting/start', {
      recipeId: 'recipe_mining_laser_i',
    });
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const { status } = await api(player, 'POST', '/api/crafting/collect', {
        craftId: started.body.craft.id,
      });
      expect(status).toBe(409);
    }
    const inventory = await prisma().inventoryItem.findFirst({
      where: { userId: player.userId, kind: 'module', defId: 'mining_laser_i' },
    });
    expect(inventory).toBeNull();
  });

  it('cannot collect another player craft', async () => {
    await setLevel(player.userId, 10);
    await giveCredits(player.userId, 100_000);
    await giveResources(player.userId, [
      { defId: 'iron', amount: 30 },
      { defId: 'titanium', amount: 10 },
    ]);
    const started = await api<{ craft: { id: string } }>(player, 'POST', '/api/crafting/start', {
      recipeId: 'recipe_mining_laser_i',
    });
    const attacker = await signIn(43);
    const { status } = await api(attacker, 'POST', '/api/crafting/collect', {
      craftId: started.body.craft.id,
    });
    expect(status).toBe(404);
  });

  it('cannot equip an item it does not own', async () => {
    const { status, body } = await api<{ error: { code: string } }>(
      player,
      'POST',
      '/api/inventory/equip',
      { kind: 'cosmetic', defId: 'trail_nova' },
    );
    expect(status).toBe(403);
    expect(body.error.code).toBe('not_owned');
  });

  it('cannot wear a cosmetic it does not own through the avatar editor', async () => {
    const { status } = await api(player, 'PUT', '/api/player/avatar', {
      displayName: 'Cheater',
      suitId: 'suit_voidwalker',
      helmetId: 'helmet_standard',
      suitPattern: 'pattern_plain',
      visor: 'visor_ice',
      emblem: 'emblem_federation',
      accessory: 'accessory_pack',
      primaryColor: '#ffffff',
      secondaryColor: '#000000',
    });
    expect(status).toBe(403);
  });

  it('cannot equip a module it does not own', async () => {
    const ships = await api<{ ships: { id: string }[] }>(player, 'GET', '/api/ships');
    const { status } = await api(player, 'POST', '/api/ships/equip', {
      shipId: ships.body.ships[0]!.id,
      moduleId: 'harmonic_extractor',
      slotIndex: 0,
    });
    expect(status).toBe(400);
  });

  it('does not duplicate a module by equipping it twice', async () => {
    await giveResources(player.userId, [{ defId: 'ion_thruster', amount: 1, kind: 'module' }]);
    const ships = await api<{ ships: { id: string }[] }>(player, 'GET', '/api/ships');
    const shipId = ships.body.ships[0]!.id;

    const first = await api(player, 'POST', '/api/ships/equip', {
      shipId,
      moduleId: 'ion_thruster',
      slotIndex: 0,
    });
    expect(first.status).toBe(200);

    const second = await api(player, 'POST', '/api/ships/equip', {
      shipId,
      moduleId: 'ion_thruster',
      slotIndex: 1,
    });
    expect(second.status).toBe(400);

    const owned = await prisma().shipModule.count({ where: { shipId } });
    expect(owned).toBe(1);
  });

  it('cannot claim to have entered an area it is nowhere near', async () => {
    await setLevel(player.userId, 10);
    const { status, body } = await api<{ error: { code: string } }>(
      player,
      'POST',
      '/api/player/area',
      { area: 'command_deck', position: { x: 0, y: 0, z: 14 } },
    );
    expect(status).toBe(400);
    expect(body.error.code).toBe('too_far_away');
  });

  it('cannot enter an area above its level, even standing in it', async () => {
    const { status, body } = await api<{ error: { code: string } }>(
      player,
      'POST',
      '/api/player/area',
      { area: 'command_deck', position: { x: 0, y: 7, z: -140 } },
    );
    expect(status).toBe(403);
    expect(body.error.code).toBe('area_locked');
  });

  it('cannot use a terminal from across the station', async () => {
    const { status, body } = await api<{ error: { code: string } }>(
      player,
      'POST',
      '/api/player/interact',
      { interactableId: 'lab_bench', position: { x: 0, y: 0, z: 14 } },
    );
    expect(status).toBe(400);
    expect(body.error.code).toBe('too_far_away');
  });

  it('rejects an unknown terminal id', async () => {
    const { status } = await api(player, 'POST', '/api/player/interact', {
      interactableId: 'admin_console',
      position: { x: 0, y: 0, z: 0 },
    });
    expect(status).toBe(404);
  });

  it('refuses to take an item on chain that the player does not own', async () => {
    const { status } = await api(player, 'POST', '/api/chain/mint', {
      kind: 'module',
      defId: 'harmonic_extractor',
      amount: 1,
    });
    // Either the deployment has no minter (502) or the item is not owned (400/403).
    expect([400, 403, 502]).toContain(status);
  });

  it('refuses to take a non-tokenisable item on chain', async () => {
    await giveResources(player.userId, [{ defId: 'iron', amount: 100 }]);
    const { status } = await api(player, 'POST', '/api/chain/mint', {
      kind: 'resource',
      defId: 'iron',
      amount: 1,
    });
    expect([403, 502]).toContain(status);
  });

  it('rejects oversized and malformed request bodies', async () => {
    const server = await testApp();
    const huge = await server.inject({
      method: 'POST',
      url: '/api/mining/refine',
      headers: { authorization: `Bearer ${player.token}` },
      payload: { batch: Array.from({ length: 500 }, () => ({ resource: 'iron', amount: 1 })) },
    });
    expect(huge.statusCode).toBe(400);

    const wrongType = await api(player, 'POST', '/api/mining/refine', { batch: 'everything' });
    expect(wrongType.status).toBe(400);
  });

  it('rejects unknown enum values instead of coercing them', async () => {
    const ships = await api<{ ships: { id: string }[] }>(player, 'GET', '/api/ships');
    const { status } = await api(player, 'POST', '/api/ships/upgrade', {
      shipId: ships.body.ships[0]!.id,
      stat: 'luck',
    });
    expect(status).toBe(400);
  });

  it('does not leak another player session through the profile route', async () => {
    const other = await signIn(44);
    const { status, body } = await api<{ player: Record<string, unknown> }>(
      null,
      'GET',
      `/api/player/profile/${other.address}`,
    );
    expect(status).toBe(200);
    expect(body.player).not.toHaveProperty('token');
    expect(JSON.stringify(body)).not.toContain(other.token);
  });
});
