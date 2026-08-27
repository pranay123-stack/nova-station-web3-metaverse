'use client';

import { TX_PHASE_DETAIL, TX_PHASE_LABEL, explorerTxUrl, isBusyPhase, type TxPhase } from '@nova/web3';
import { CHAIN_ID } from '@/lib/wagmi';

const PHASE_ORDER: TxPhase[] = ['preparing', 'awaiting_wallet', 'submitted', 'confirming', 'confirmed'];

/**
 * The transaction ladder.
 *
 * Shows exactly where a transaction is, using the phases the write hook
 * actually observed. A failed or rejected transaction says so plainly rather
 * than quietly returning to idle.
 */
export function TxStatus({
  phase,
  hash,
  error,
}: {
  phase: TxPhase;
  hash: string | null;
  error: string | null;
}) {
  if (phase === 'idle') return null;

  const index = PHASE_ORDER.indexOf(phase);
  const failed = phase === 'failed' || phase === 'rejected';
  const explorer = hash ? explorerTxUrl(CHAIN_ID, hash) : null;

  return (
    <div
      className={`border p-3 ${failed ? 'border-rose-500/50 bg-rose-950/20' : 'border-sky-500/40 bg-sky-950/20'}`}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-2">
        {isBusyPhase(phase) && (
          <span className="h-3 w-3 animate-spin rounded-full border border-sky-400 border-t-transparent" />
        )}
        <p className={`text-xs ${failed ? 'text-rose-200' : 'text-sky-200'}`}>
          {TX_PHASE_LABEL[phase]}
        </p>
      </div>
      <p className="mt-1 text-[11px] text-slate-400">{error ?? TX_PHASE_DETAIL[phase]}</p>

      {!failed && (
        <ol className="mt-2 flex gap-1">
          {PHASE_ORDER.map((step, stepIndex) => (
            <li
              key={step}
              className={`h-0.5 flex-1 ${
                stepIndex <= index ? 'bg-sky-400' : 'bg-slate-700'
              }`}
              aria-label={TX_PHASE_LABEL[step]}
            />
          ))}
        </ol>
      )}

      {hash && (
        <p className="mt-2 font-mono text-[10px] text-slate-500">
          {explorer ? (
            <a
              href={explorer}
              target="_blank"
              rel="noreferrer noopener"
              className="text-sky-400 underline-offset-2 hover:underline"
            >
              {hash.slice(0, 18)}…
            </a>
          ) : (
            `${hash.slice(0, 18)}…`
          )}
        </p>
      )}
    </div>
  );
}
