import { RECIPES, RECIPES_BY_ID } from '@nova/game-data';
import { checkCraft, craftIsReady, craftRemainingSec, resolveCraft } from '@nova/game-engine';
import { GameError, type CraftDto } from '@nova/shared';
import type { Db } from '../db/client.js';
import { bigIntToSeed, secureSeed, seedToBigInt } from '../lib/ids.js';
import { addItems, removeItems, resourceBag } from './inventory.js';
import { moveCredits } from './ledger.js';
import { events, recordEvent } from './events.js';
import { awardXp, readStanding, standingRanks } from './progression.js';

function craftDto(row: {
  id: string;
  recipeId: string;
  startedAt: Date;
  readyAt: Date;
  collected: boolean;
}): CraftDto {
  const recipe = RECIPES_BY_ID.get(row.recipeId);
  return {
    id: row.id,
    recipeId: row.recipeId,
    startedAt: row.startedAt.toISOString(),
    readyAt: row.readyAt.toISOString(),
    secondsRemaining: recipe ? craftRemainingSec(recipe, row.startedAt.getTime(), Date.now()) : 0,
    collected: row.collected,
  };
}

export async function activeCrafts(db: Db, userId: string): Promise<CraftDto[]> {
  const rows = await db.craftJob.findMany({
    where: { userId, collected: false },
    orderBy: { readyAt: 'asc' },
    select: { id: true, recipeId: true, startedAt: true, readyAt: true, collected: true },
  });
  return rows.map(craftDto);
}

/** How many benches a player may occupy at once. */
export const MAX_CONCURRENT_CRAFTS = 2;

/**
 * Starts a craft.
 *
 * Inputs are debited the moment the bench is claimed, inside the same
 * transaction that creates the job. There is no window in which a player holds
 * both the materials and the pending craft, so the same ore cannot fund two
 * jobs by firing two requests at once.
 */
export async function startCraft(
  db: Db,
  userId: string,
  recipeId: string,
  area: string,
): Promise<CraftDto> {
  return db.$transaction(async (tx) => {
    const user = await tx.user.findUniqueOrThrow({
      where: { id: userId },
      select: { level: true, credits: true },
    });
    const busy = await tx.craftJob.count({ where: { userId, collected: false } });
    const standing = await readStanding(tx, userId);
    const bag = await resourceBag(tx, userId);

    const check = checkCraft(recipeId, {
      level: user.level,
      credits: Number(user.credits),
      resources: bag,
      factionRanks: standingRanks(standing),
      area,
      benchBusy: busy >= MAX_CONCURRENT_CRAFTS,
    });

    if (!check.ok || !check.recipe) {
      const code =
        check.reason === 'level'
          ? 'insufficient_level'
          : check.reason === 'faction'
            ? 'insufficient_reputation'
            : check.reason === 'credits'
              ? 'insufficient_credits'
              : check.reason === 'resources'
                ? 'insufficient_resources'
                : check.reason === 'wrong_station'
                  ? 'too_far_away'
                  : check.reason === 'bench_busy'
                    ? 'busy'
                    : 'not_found';
      const message =
        check.reason === 'wrong_station'
          ? 'You must be at the Laboratory bench to start this.'
          : check.reason === 'bench_busy'
            ? 'Both benches are occupied.'
            : check.reason === 'resources'
              ? 'You are short on materials.'
              : 'You cannot start that craft.';
      throw new GameError(code, message, check.missing);
    }

    const recipe = check.recipe;
    await removeItems(
      tx,
      userId,
      recipe.inputs.map((input) => ({
        kind: 'resource' as const,
        defId: input.resource,
        amount: input.amount,
      })),
    );
    if (recipe.creditCost > 0) {
      await moveCredits(tx, {
        userId,
        kind: 'craft',
        delta: -BigInt(recipe.creditCost),
        reason: `Bench fee: ${recipe.name}`,
      });
    }

    const startedAt = new Date();
    const row = await tx.craftJob.create({
      data: {
        userId,
        recipeId: recipe.id,
        startedAt,
        readyAt: new Date(startedAt.getTime() + recipe.durationSec * 1000),
        seed: seedToBigInt(secureSeed()),
      },
      select: { id: true, recipeId: true, startedAt: true, readyAt: true, collected: true },
    });
    return craftDto(row);
  });
}

export interface CollectResult {
  readonly outputKind: string;
  readonly outputId: string;
  readonly amount: number;
  readonly bonusApplied: boolean;
  readonly xp: number;
  readonly newLevel: number;
}

export async function collectCraft(db: Db, userId: string, craftId: string): Promise<CollectResult> {
  return db.$transaction(async (tx) => {
    const row = await tx.craftJob.findFirst({
      where: { id: craftId, userId },
      select: { id: true, recipeId: true, startedAt: true, collected: true, seed: true },
    });
    if (!row) throw new GameError('not_found', 'No such craft.');
    if (row.collected) throw new GameError('conflict', 'That craft was already collected.');

    const recipe = RECIPES_BY_ID.get(row.recipeId);
    if (!recipe) throw new GameError('internal_error', 'Recipe definition is missing.');
    if (!craftIsReady(recipe, row.startedAt.getTime(), Date.now())) {
      throw new GameError('not_active', 'That craft is not finished yet.', {
        secondsRemaining: craftRemainingSec(recipe, row.startedAt.getTime(), Date.now()),
      });
    }

    const collected = await tx.craftJob.updateMany({
      where: { id: row.id, collected: false },
      data: { collected: true },
    });
    if (collected.count !== 1) {
      throw new GameError('conflict', 'That craft was already collected.');
    }

    const outcome = resolveCraft(recipe, bigIntToSeed(row.seed));
    await addItems(tx, userId, [
      {
        kind: outcome.outputKind as 'module' | 'equipment' | 'cosmetic' | 'resource',
        defId: outcome.outputId,
        amount: outcome.amount,
      },
    ]);
    await recordEvent(tx, userId, events.crafted(recipe.id, 1));
    const progression = await awardXp(tx, userId, outcome.xp);

    return {
      outputKind: outcome.outputKind,
      outputId: outcome.outputId,
      amount: outcome.amount,
      bonusApplied: outcome.bonusApplied,
      xp: outcome.xp,
      newLevel: progression.level,
    };
  });
}

export { RECIPES };
