'use client';

import { createConfig, http } from 'wagmi';
import { anvil, sepolia } from '@nova/web3';

/**
 * Wallet configuration.
 *
 * Connectors are discovered through EIP-6963 rather than imported from
 * `wagmi/connectors`. That barrel pulls in every connector wagmi ships —
 * including a Coinbase SDK with an optional dependency that does not resolve in
 * a browser bundle — for the sake of the one connector this game needs.
 * Auto-discovery gets the same result: any injected wallet that announces
 * itself appears in `useConnect().connectors`, and modern wallets all do.
 *
 * WalletConnect is deliberately absent. It would mean a project id, a relay
 * dependency and a modal the game does not control, for a Sepolia game where
 * the browser wallet the player already has is the only real requirement.
 */
export const CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? sepolia.id);

export const wagmiConfig = createConfig({
  chains: [sepolia, anvil],
  multiInjectedProviderDiscovery: true,
  transports: {
    [sepolia.id]: http(process.env.NEXT_PUBLIC_RPC_URL ?? undefined),
    [anvil.id]: http('http://127.0.0.1:8545'),
  },
  ssr: true,
});

declare module 'wagmi' {
  interface Register {
    config: typeof wagmiConfig;
  }
}
