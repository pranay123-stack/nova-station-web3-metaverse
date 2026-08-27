import type { Address } from 'viem';

export interface ContractAddresses {
  readonly assets: Address;
  readonly items: Address;
  readonly marketplace: Address;
  readonly rewardVault: Address;
}

export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as const;

const EMPTY: ContractAddresses = {
  assets: ZERO_ADDRESS,
  items: ZERO_ADDRESS,
  marketplace: ZERO_ADDRESS,
  rewardVault: ZERO_ADDRESS,
};

function normalise(value: string | undefined): Address {
  if (!value || !/^0x[a-fA-F0-9]{40}$/.test(value)) return ZERO_ADDRESS;
  return value as Address;
}

/**
 * Reads contract addresses from configuration.
 *
 * Addresses are configuration, never constants: the same build runs against
 * anvil and Sepolia. When an address is missing the corresponding feature
 * reports itself unconfigured rather than sending a transaction into the void.
 */
export function readAddresses(env: Record<string, string | undefined>): ContractAddresses {
  return {
    assets: normalise(env.NEXT_PUBLIC_CONTRACT_ASSETS ?? env.CONTRACT_ASSETS),
    items: normalise(env.NEXT_PUBLIC_CONTRACT_ITEMS ?? env.CONTRACT_ITEMS),
    marketplace: normalise(env.NEXT_PUBLIC_CONTRACT_MARKETPLACE ?? env.CONTRACT_MARKETPLACE),
    rewardVault: normalise(env.NEXT_PUBLIC_CONTRACT_REWARD_VAULT ?? env.CONTRACT_REWARD_VAULT),
  };
}

export function isConfigured(addresses: ContractAddresses): boolean {
  return (
    addresses.assets !== ZERO_ADDRESS &&
    addresses.items !== ZERO_ADDRESS &&
    addresses.marketplace !== ZERO_ADDRESS
  );
}

export function emptyAddresses(): ContractAddresses {
  return EMPTY;
}
