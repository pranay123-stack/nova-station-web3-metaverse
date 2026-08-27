/**
 * The lifecycle a blockchain action moves through, and the copy shown for each.
 *
 * The UI never invents a state: every step below corresponds to something that
 * actually happened — a wallet prompt opened, a hash came back, a receipt
 * confirmed. There is no "pretend it worked" path.
 */
export const TX_PHASES = [
  'idle',
  'preparing',
  'awaiting_wallet',
  'submitted',
  'confirming',
  'confirmed',
  'failed',
  'rejected',
] as const;

export type TxPhase = (typeof TX_PHASES)[number];

export const TX_PHASE_LABEL: Readonly<Record<TxPhase, string>> = {
  idle: 'Ready',
  preparing: 'Preparing',
  awaiting_wallet: 'Waiting for wallet',
  submitted: 'Transaction submitted',
  confirming: 'Confirming',
  confirmed: 'Confirmed',
  failed: 'Failed',
  rejected: 'Rejected in wallet',
};

export const TX_PHASE_DETAIL: Readonly<Record<TxPhase, string>> = {
  idle: '',
  preparing: 'Simulating the call against the current chain state.',
  awaiting_wallet: 'Approve the transaction in your wallet to continue.',
  submitted: 'Broadcast to the network. Waiting for it to be picked up.',
  confirming: 'Included in a block. Waiting for confirmations.',
  confirmed: 'Settled on chain.',
  failed: 'The transaction reverted. Nothing was transferred.',
  rejected: 'You dismissed the request in your wallet. Nothing was sent.',
};

export function isTerminalPhase(phase: TxPhase): boolean {
  return phase === 'confirmed' || phase === 'failed' || phase === 'rejected';
}

export function isBusyPhase(phase: TxPhase): boolean {
  return phase === 'preparing' || phase === 'awaiting_wallet' || phase === 'submitted' || phase === 'confirming';
}

/** Turns a viem/wallet error into something a player can act on. */
export function describeTxError(error: unknown): { phase: TxPhase; message: string } {
  const raw = error instanceof Error ? error.message : String(error);
  const lower = raw.toLowerCase();

  if (lower.includes('user rejected') || lower.includes('user denied') || lower.includes('rejected the request')) {
    return { phase: 'rejected', message: 'You dismissed the request in your wallet.' };
  }
  if (lower.includes('insufficient funds')) {
    return { phase: 'failed', message: 'Not enough ETH to cover the price plus gas.' };
  }
  if (lower.includes('nonce too low') || lower.includes('already known')) {
    return { phase: 'failed', message: 'A transaction with this nonce was already sent. Try again.' };
  }
  if (lower.includes('chain mismatch') || lower.includes('chain id')) {
    return { phase: 'failed', message: 'Your wallet is on the wrong network. Switch and retry.' };
  }
  // Surface the contract's own custom error name when there is one.
  const custom = /(?:reverted with|Error:)\s*([A-Z][A-Za-z0-9]*)\(/.exec(raw);
  if (custom && custom[1]) {
    return { phase: 'failed', message: `The contract rejected this call: ${custom[1]}.` };
  }
  return { phase: 'failed', message: raw.slice(0, 200) };
}
