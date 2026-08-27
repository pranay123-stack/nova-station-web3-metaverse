import type { Address, Hex } from 'viem';

/**
 * EIP-712 typed data for a reward voucher.
 *
 * This mirrors `NovaRewardVault.Voucher` exactly. The types are shared so the
 * server signs, the contract verifies and the client displays the *same*
 * structure — a mismatch in field order would produce a signature the contract
 * rejects, which is caught by the round-trip test rather than in production.
 */
export const VOUCHER_TYPES = {
  Voucher: [
    { name: 'to', type: 'address' },
    { name: 'nonce', type: 'uint256' },
    { name: 'kind', type: 'uint8' },
    { name: 'collection', type: 'address' },
    { name: 'tokenId', type: 'uint256' },
    { name: 'amount', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
} as const;

export const VOUCHER_DOMAIN_NAME = 'NovaRewardVault';
export const VOUCHER_DOMAIN_VERSION = '1';

export const REWARD_KIND = { eth: 0, erc721: 1, erc1155: 2 } as const;
export type RewardKind = (typeof REWARD_KIND)[keyof typeof REWARD_KIND];

export interface Voucher {
  readonly to: Address;
  readonly nonce: bigint;
  readonly kind: RewardKind;
  readonly collection: Address;
  readonly tokenId: bigint;
  readonly amount: bigint;
  readonly deadline: bigint;
}

export function voucherDomain(chainId: number, verifyingContract: Address) {
  return {
    name: VOUCHER_DOMAIN_NAME,
    version: VOUCHER_DOMAIN_VERSION,
    chainId,
    verifyingContract,
  } as const;
}

/** The full typed-data payload passed to `signTypedData` / `verifyTypedData`. */
export function voucherTypedData(chainId: number, verifyingContract: Address, voucher: Voucher) {
  return {
    domain: voucherDomain(chainId, verifyingContract),
    types: VOUCHER_TYPES,
    primaryType: 'Voucher',
    message: voucher,
  } as const;
}

export interface SignedVoucher {
  readonly voucher: Voucher;
  readonly signature: Hex;
}

/** Serialises a voucher for JSON transport, where bigints are not allowed. */
export function serialiseVoucher(voucher: Voucher) {
  return {
    to: voucher.to,
    nonce: voucher.nonce.toString(),
    kind: voucher.kind,
    collection: voucher.collection,
    tokenId: voucher.tokenId.toString(),
    amount: voucher.amount.toString(),
    deadline: voucher.deadline.toString(),
  };
}

export function deserialiseVoucher(raw: ReturnType<typeof serialiseVoucher>): Voucher {
  return {
    to: raw.to as Address,
    nonce: BigInt(raw.nonce),
    kind: raw.kind as RewardKind,
    collection: raw.collection as Address,
    tokenId: BigInt(raw.tokenId),
    amount: BigInt(raw.amount),
    deadline: BigInt(raw.deadline),
  };
}
