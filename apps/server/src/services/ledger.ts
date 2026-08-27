import { GameError } from '@nova/shared';
import type { Tx } from '../db/client.js';

export type LedgerKind =
  | 'mission'
  | 'refine'
  | 'craft'
  | 'upgrade'
  | 'broker'
  | 'market'
  | 'market_fee'
  | 'stipend'
  | 'levelup'
  | 'ship'
  | 'fuel'
  | 'listing_fee'
  | 'admin';

export interface LedgerMove {
  readonly userId: string;
  readonly kind: LedgerKind;
  /** Positive to credit the player, negative to debit. */
  readonly delta: bigint;
  readonly reason: string;
  readonly refId?: string;
}

/**
 * The single place credits move.
 *
 * Every route that changes a balance goes through here, inside the caller's
 * transaction, and every movement leaves a `LedgerEntry` behind. Two properties
 * follow: a balance can never go negative (the debit throws instead), and any
 * balance can be reconstructed by replaying the journal — which is what turns
 * "we think this account was exploited" into a question with an answer.
 */
export async function moveCredits(tx: Tx, move: LedgerMove): Promise<bigint> {
  if (move.delta === 0n) {
    const current = await tx.user.findUnique({
      where: { id: move.userId },
      select: { credits: true },
    });
    if (!current) throw new GameError('not_found', 'Player not found.');
    return current.credits;
  }

  if (move.delta < 0n) {
    // Conditional update: the debit only applies if the balance covers it, so
    // two concurrent spends cannot both succeed against the same credits.
    const debited = await tx.user.updateMany({
      where: { id: move.userId, credits: { gte: -move.delta } },
      data: { credits: { increment: move.delta } },
    });
    if (debited.count !== 1) {
      throw new GameError('insufficient_credits', 'Not enough credits.');
    }
  } else {
    await tx.user.update({
      where: { id: move.userId },
      data: {
        credits: { increment: move.delta },
        creditsEarned: { increment: move.delta },
      },
    });
  }

  const after = await tx.user.findUniqueOrThrow({
    where: { id: move.userId },
    select: { credits: true },
  });

  await tx.ledgerEntry.create({
    data: {
      userId: move.userId,
      kind: move.kind,
      delta: move.delta,
      balanceAfter: after.credits,
      reason: move.reason.slice(0, 200),
      refId: move.refId ?? null,
    },
  });

  return after.credits;
}

/** Reads a balance without touching it. */
export async function balanceOf(tx: Tx, userId: string): Promise<bigint> {
  const user = await tx.user.findUnique({ where: { id: userId }, select: { credits: true } });
  if (!user) throw new GameError('not_found', 'Player not found.');
  return user.credits;
}

/**
 * Recomputes a balance from the journal.
 *
 * Used by the integrity test and available for support: if the cached balance
 * and the ledger ever disagree, the ledger is right.
 */
export async function replayBalance(tx: Tx, userId: string): Promise<bigint> {
  const entries = await tx.ledgerEntry.findMany({
    where: { userId },
    select: { delta: true },
  });
  return entries.reduce((sum, entry) => sum + entry.delta, 0n);
}
