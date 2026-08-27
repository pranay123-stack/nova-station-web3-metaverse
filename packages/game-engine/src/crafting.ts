import {
  RECIPES_BY_ID,
  type FactionId,
  type RecipeDef,
  type ResourceId,
} from '@nova/game-data';
import { canAfford, type ResourceBag } from './inventory.js';
import { createRng } from './rng.js';

export type CraftRejection =
  | 'unknown_recipe'
  | 'level'
  | 'faction'
  | 'credits'
  | 'resources'
  | 'wrong_station'
  | 'bench_busy';

export interface CraftContext {
  readonly level: number;
  readonly credits: number;
  readonly resources: ResourceBag;
  readonly factionRanks: Readonly<Record<FactionId, number>>;
  /** Where the player is standing, checked against the recipe's station. */
  readonly area: string;
  readonly benchBusy: boolean;
}

export interface CraftCheck {
  readonly ok: boolean;
  readonly reason?: CraftRejection;
  readonly missing?: readonly { readonly resource: ResourceId; readonly amount: number }[];
  readonly recipe?: RecipeDef;
}

/**
 * Pure precondition check for a craft. The server calls this inside the same
 * database transaction that debits the inputs, so a craft can never be started
 * twice from one set of materials.
 */
export function checkCraft(recipeId: string, ctx: CraftContext): CraftCheck {
  const recipe = RECIPES_BY_ID.get(recipeId);
  if (!recipe) return { ok: false, reason: 'unknown_recipe' };
  if (ctx.benchBusy) return { ok: false, reason: 'bench_busy', recipe };
  if (ctx.area !== recipe.station) return { ok: false, reason: 'wrong_station', recipe };
  if (ctx.level < recipe.requiredLevel) return { ok: false, reason: 'level', recipe };
  if (recipe.requiredFaction) {
    const rank = ctx.factionRanks[recipe.requiredFaction.faction] ?? 0;
    if (rank < recipe.requiredFaction.rank) return { ok: false, reason: 'faction', recipe };
  }
  if (ctx.credits < recipe.creditCost) return { ok: false, reason: 'credits', recipe };
  const affordability = canAfford(ctx.resources, recipe.inputs);
  if (!affordability.ok) {
    return { ok: false, reason: 'resources', missing: affordability.missing, recipe };
  }
  return { ok: true, recipe };
}

export interface CraftOutcome {
  readonly outputKind: RecipeDef['output']['kind'];
  readonly outputId: string;
  readonly amount: number;
  readonly bonusApplied: boolean;
  readonly xp: number;
}

/** Resolves a finished craft, including the research bonus roll. */
export function resolveCraft(recipe: RecipeDef, seed: number): CraftOutcome {
  const rng = createRng(seed);
  const bonus = rng.chance(recipe.bonusChance);
  return {
    outputKind: recipe.output.kind,
    outputId: recipe.output.id,
    amount: recipe.output.amount + (bonus ? 1 : 0),
    bonusApplied: bonus,
    // XP scales with the value of what went in, so high-tier crafts are worth the wait.
    xp: Math.round(20 + recipe.creditCost * 0.02 + recipe.durationSec * 0.35),
  };
}

/** Seconds remaining on a craft that started at `startedAt`. */
export function craftRemainingSec(recipe: RecipeDef, startedAtMs: number, nowMs: number): number {
  const elapsed = (nowMs - startedAtMs) / 1000;
  return Math.max(0, Math.ceil(recipe.durationSec - elapsed));
}

export function craftIsReady(recipe: RecipeDef, startedAtMs: number, nowMs: number): boolean {
  return craftRemainingSec(recipe, startedAtMs, nowMs) <= 0;
}
