'use client';

import { useCallback, useState } from 'react';
import { useAccount, useConfig, usePublicClient, useSwitchChain, useWalletClient } from 'wagmi';
import { waitForTransactionReceipt } from 'wagmi/actions';
import type { Abi, Address } from 'viem';
import { describeTxError, isSupportedChain, type TxPhase } from '@nova/web3';
import { api } from '@/lib/api';
import { useGameStore } from '@/stores/useGameStore';
import { CHAIN_ID } from './wagmi';

export interface ChainConfig {
  readonly chainId: number;
  readonly configured: boolean;
  readonly mintingAvailable: boolean;
  readonly contracts: {
    readonly assets: Address;
    readonly items: Address;
    readonly marketplace: Address;
    readonly rewardVault: Address;
  };
  /** Items this deployment has registered as mintable on chain. */
  readonly mintableItems: readonly { readonly tokenId: number; readonly kind: string; readonly defId: string }[];
}

export interface TxState {
  readonly phase: TxPhase;
  readonly hash: string | null;
  readonly error: string | null;
}

const IDLE: TxState = { phase: 'idle', hash: null, error: null };

/**
 * Runs a contract write and reports every real stage of it.
 *
 * The phases below correspond to things that actually happened — a simulation
 * succeeded, a wallet returned a hash, a receipt confirmed. There is no path
 * through this hook that reports success without a mined receipt, which is the
 * whole point: the interface never claims a transaction that did not happen.
 */
export function useContractWrite() {
  const config = useConfig();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();
  const { address, chainId } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const toast = useGameStore((state) => state.toast);
  const [state, setState] = useState<TxState>(IDLE);

  const reset = useCallback(() => setState(IDLE), []);

  const write = useCallback(
    async (options: {
      address: Address;
      abi: Abi;
      functionName: string;
      args: readonly unknown[];
      value?: bigint;
      intent: 'mint' | 'list' | 'buy' | 'cancel' | 'redeem' | 'withdraw';
      description: string;
    }): Promise<`0x${string}` | null> => {
      if (!walletClient || !address) {
        setState({ phase: 'failed', hash: null, error: 'Connect a wallet first.' });
        return null;
      }
      if (!publicClient) {
        setState({ phase: 'failed', hash: null, error: 'No RPC endpoint configured.' });
        return null;
      }

      try {
        // Wrong network is a common and recoverable state; ask to switch rather
        // than sending a transaction that would land on the wrong chain.
        if (chainId !== CHAIN_ID) {
          if (!isSupportedChain(CHAIN_ID)) {
            setState({ phase: 'failed', hash: null, error: 'Unsupported network configured.' });
            return null;
          }
          await switchChainAsync({ chainId: CHAIN_ID as 11155111 | 31337 });
        }

        setState({ phase: 'preparing', hash: null, error: null });
        // Simulating first turns most reverts into a clear message before the
        // player is asked to sign anything.
        const simulation = await publicClient.simulateContract({
          account: address,
          address: options.address,
          abi: options.abi,
          functionName: options.functionName,
          args: options.args as never,
          ...(options.value === undefined ? {} : { value: options.value }),
        });

        setState({ phase: 'awaiting_wallet', hash: null, error: null });
        const hash = await walletClient.writeContract(simulation.request);

        setState({ phase: 'submitted', hash, error: null });
        // Recording the hash lets the server follow it; it proves nothing on
        // its own, and the indexer is what decides the outcome.
        void api.post('/api/chain/transactions', { txHash: hash, intent: options.intent });

        setState({ phase: 'confirming', hash, error: null });
        const receipt = await waitForTransactionReceipt(config, {
          hash,
          confirmations: 1,
        });

        if (receipt.status === 'reverted') {
          setState({ phase: 'failed', hash, error: 'The transaction reverted on chain.' });
          toast({ kind: 'error', title: `${options.description} failed`, detail: 'Reverted on chain.' });
          return null;
        }

        setState({ phase: 'confirmed', hash, error: null });
        toast({
          kind: 'success',
          title: `${options.description} confirmed`,
          detail: 'Settled on chain. The registry will catch up in a moment.',
          ttl: 7000,
        });
        return hash;
      } catch (error) {
        const described = describeTxError(error);
        setState({ phase: described.phase, hash: null, error: described.message });
        toast({
          kind: described.phase === 'rejected' ? 'warn' : 'error',
          title: `${options.description} ${described.phase === 'rejected' ? 'cancelled' : 'failed'}`,
          detail: described.message,
        });
        return null;
      }
    },
    [walletClient, address, publicClient, chainId, switchChainAsync, config, toast],
  );

  return { write, state, reset };
}

/** Reads deployment configuration from the server, once per session. */
export function useChainConfig() {
  const [config, setConfig] = useState<ChainConfig | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setConfig(await api.get<ChainConfig>('/api/chain/config'));
    } catch {
      setConfig(null);
    } finally {
      setLoading(false);
    }
  }, []);

  return { config, loading, load };
}
