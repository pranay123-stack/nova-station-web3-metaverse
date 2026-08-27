'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useAccount, useConnect, useDisconnect, useSignMessage, useSwitchChain } from 'wagmi';
import { chainName, isSupportedChain } from '@nova/web3';
import { Button, Spinner } from '@nova/ui';
import { api, ApiError, setSessionToken } from '@/lib/api';
import { CHAIN_ID } from '@/lib/wagmi';
import { useAuthStore } from '@/stores/useAuthStore';
import { usePlayerStore } from '@/stores/usePlayerStore';
import { shortAddress } from '@/lib/format';

/**
 * Wallet connection and sign-in.
 *
 * The flow is deliberately three separate, visible steps — connect, correct
 * network, sign — because each can fail for a different reason and a single
 * "connect" button that silently does all three leaves a player stuck with no
 * idea which part went wrong.
 *
 * Signing is a message, not a transaction: no gas, no approval, nothing on
 * chain. The signature proves the address and nothing else.
 */
export function ConnectGate({ onReady }: { onReady: () => void }) {
  const { address, isConnected, chainId } = useAccount();
  const {
    connect,
    connectors,
    isPending: connecting,
    error: connectError,
  } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain, isPending: switching } = useSwitchChain();
  const { signMessageAsync } = useSignMessage();

  const status = useAuthStore((state) => state.status);
  const setStatus = useAuthStore((state) => state.setStatus);
  const setSession = useAuthStore((state) => state.setSession);
  const restore = useAuthStore((state) => state.restore);
  const setPlayer = usePlayerStore((state) => state.setPlayer);

  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);

  // Wallets announce themselves through EIP-6963; the first one discovered is
  // offered, and the rest are listed so a player with several can choose.
  const [primary, ...alternatives] = connectors;
  const wrongNetwork = isConnected && chainId !== CHAIN_ID;

  // An existing session skips the whole flow.
  useEffect(() => {
    void (async () => {
      const player = await restore();
      if (player) {
        setPlayer(player);
        onReady();
      }
      setChecking(false);
    })();
  }, [restore, setPlayer, onReady]);

  const signIn = useCallback(async () => {
    if (!address) return;
    setError(null);
    setStatus('signing_in');
    try {
      const challenge = await api.post<{ message: string }>('/api/auth/nonce', { address });
      const signature = await signMessageAsync({ message: challenge.message });
      const result = await api.post<{
        token: string;
        session: { address: string; issuedAt: string; expiresAt: string; chainId: number };
        player: Parameters<typeof setPlayer>[0];
        stipend: number;
      }>('/api/auth/verify', { message: challenge.message, signature });

      // Kept alongside the cookie so the session survives an origin split.
      setSessionToken(result.token);
      setSession(result.session);
      setPlayer(result.player);
      setStatus('signed_in');
      onReady();
    } catch (caught) {
      const message =
        caught instanceof ApiError
          ? caught.message
          : caught instanceof Error && caught.message.toLowerCase().includes('rejected')
            ? 'You dismissed the signature request.'
            : 'Sign-in failed. Try again.';
      setError(message);
      setStatus('signed_out');
    }
  }, [address, signMessageAsync, setSession, setPlayer, setStatus, onReady]);

  if (checking) {
    return (
      <Shell>
        <Spinner label="Checking for an existing session" />
      </Shell>
    );
  }

  return (
    <Shell>
      <ol className="w-full space-y-3">
        <Step index={1} label="Connect a wallet" done={isConnected}>
          {isConnected ? (
            <div className="flex items-center gap-2">
              <span className="font-mono text-[11px] text-slate-400">{shortAddress(address)}</span>
              <Button size="sm" variant="ghost" onClick={() => disconnect()}>
                Disconnect
              </Button>
            </div>
          ) : primary ? (
            <div className="flex flex-wrap gap-1.5">
              <Button
                variant="primary"
                loading={connecting}
                onClick={() => connect({ connector: primary })}
              >
                Connect {primary.name}
              </Button>
              {alternatives.map((connector) => (
                <Button
                  key={connector.uid}
                  variant="secondary"
                  loading={connecting}
                  onClick={() => connect({ connector })}
                >
                  {connector.name}
                </Button>
              ))}
            </div>
          ) : (
            <p className="text-[11px] text-amber-300">
              No browser wallet detected. Install MetaMask or another injected wallet to sign in.
            </p>
          )}
        </Step>

        <Step index={2} label={`Switch to ${chainName(CHAIN_ID)}`} done={isConnected && !wrongNetwork}>
          {wrongNetwork ? (
            <div>
              <p className="mb-2 text-[11px] text-amber-300">
                Your wallet is on {chainName(chainId ?? 0)}. NOVA STATION runs on{' '}
                {chainName(CHAIN_ID)}.
              </p>
              <Button
                variant="primary"
                loading={switching}
                disabled={!isSupportedChain(CHAIN_ID)}
                onClick={() => switchChain({ chainId: CHAIN_ID as 11155111 | 31337 })}
              >
                Switch network
              </Button>
            </div>
          ) : (
            <p className="text-[11px] text-slate-500">
              {isConnected ? 'Correct network.' : 'Connect a wallet first.'}
            </p>
          )}
        </Step>

        <Step index={3} label="Sign in" done={status === 'signed_in'}>
          <p className="mb-2 text-[11px] text-slate-500">
            One signature proves the wallet is yours. It is not a transaction, costs no gas and
            authorises nothing on chain.
          </p>
          <Button
            variant="primary"
            disabled={!isConnected || wrongNetwork}
            loading={status === 'signing_in'}
            onClick={() => void signIn()}
          >
            Sign in with Ethereum
          </Button>
        </Step>
      </ol>

      {(error || connectError) && (
        <p role="alert" className="mt-4 border border-rose-500/40 bg-rose-950/30 px-3 py-2 text-[11px] text-rose-200">
          {error ?? connectError?.message}
        </p>
      )}

      <Link href="/" className="mt-6 text-[11px] text-slate-600 transition-colors hover:text-slate-400">
        ← Back to the briefing
      </Link>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-[#05070d] px-5">
      <div aria-hidden className="grid-backdrop pointer-events-none absolute inset-0 opacity-30" />
      <div className="relative z-10 w-full max-w-md">
        <p className="text-[10px] uppercase tracking-[0.42em] text-sky-500">Docking authorisation</p>
        <h1 className="mt-2 text-3xl tracking-tight text-slate-50">NOVA STATION</h1>
        <p className="mb-6 mt-2 text-[13px] text-slate-500">
          Station control needs to confirm who is coming aboard.
        </p>
        {children}
      </div>
    </div>
  );
}

function Step({
  index,
  label,
  done,
  children,
}: {
  index: number;
  label: string;
  done: boolean;
  children: React.ReactNode;
}) {
  return (
    <li
      className={`border p-4 transition-colors ${
        done ? 'border-emerald-500/40 bg-emerald-950/10' : 'border-slate-700/60 bg-slate-950/60'
      }`}
    >
      <div className="mb-2 flex items-center gap-2">
        <span
          className={`flex h-5 w-5 items-center justify-center border font-mono text-[10px] ${
            done ? 'border-emerald-400/60 text-emerald-300' : 'border-slate-600 text-slate-500'
          }`}
        >
          {done ? '✓' : index}
        </span>
        <span className="text-[11px] uppercase tracking-[0.18em] text-slate-300">{label}</span>
      </div>
      {children}
    </li>
  );
}
