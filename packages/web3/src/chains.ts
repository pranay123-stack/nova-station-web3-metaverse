import { defineChain } from 'viem';
import { sepolia } from 'viem/chains';

/**
 * The chains NOVA STATION runs on.
 *
 * Sepolia is the deployment target; anvil exists so the whole stack — including
 * real transactions — can be exercised locally without faucet ETH.
 */
export const anvil = defineChain({
  id: 31337,
  name: 'Anvil',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: ['http://127.0.0.1:8545'] } },
  testnet: true,
});

export const SUPPORTED_CHAINS = [sepolia, anvil] as const;
export type SupportedChainId = (typeof SUPPORTED_CHAINS)[number]['id'];

export const DEFAULT_CHAIN_ID: SupportedChainId = sepolia.id;

export function isSupportedChain(chainId: number | undefined): chainId is SupportedChainId {
  return chainId !== undefined && SUPPORTED_CHAINS.some((chain) => chain.id === chainId);
}

export function chainName(chainId: number): string {
  return SUPPORTED_CHAINS.find((chain) => chain.id === chainId)?.name ?? `Chain ${chainId}`;
}

export function explorerTxUrl(chainId: number, txHash: string): string | null {
  if (chainId === sepolia.id) return `https://sepolia.etherscan.io/tx/${txHash}`;
  return null;
}

export function explorerAddressUrl(chainId: number, address: string): string | null {
  if (chainId === sepolia.id) return `https://sepolia.etherscan.io/address/${address}`;
  return null;
}

export { sepolia };
