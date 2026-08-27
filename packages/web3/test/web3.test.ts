import { describe, expect, it } from 'vitest';
import { privateKeyToAccount } from 'viem/accounts';
import { verifyTypedData } from 'viem';
import {
  DEFAULT_CHAIN_ID,
  REWARD_KIND,
  SIWE_STATEMENT,
  ZERO_ADDRESS,
  buildSiweMessage,
  chainName,
  deserialiseVoucher,
  describeTxError,
  explorerAddressUrl,
  explorerTxUrl,
  isBusyPhase,
  isConfigured,
  isSupportedChain,
  isTerminalPhase,
  parseSiweMessage,
  readAddresses,
  serialiseVoucher,
  voucherTypedData,
  type Voucher,
} from '../src/index.js';

const ADDRESS = '0x1111111111111111111111111111111111111111';

describe('chains', () => {
  it('recognises the supported chains only', () => {
    expect(isSupportedChain(11155111)).toBe(true);
    expect(isSupportedChain(31337)).toBe(true);
    expect(isSupportedChain(1)).toBe(false);
    expect(isSupportedChain(undefined)).toBe(false);
    expect(DEFAULT_CHAIN_ID).toBe(11155111);
  });

  it('names chains and links to an explorer where one exists', () => {
    expect(chainName(11155111)).toBe('Sepolia');
    expect(chainName(999)).toBe('Chain 999');
    expect(explorerTxUrl(11155111, '0xabc')).toContain('sepolia.etherscan.io/tx/0xabc');
    expect(explorerAddressUrl(11155111, ADDRESS)).toContain('/address/');
    expect(explorerTxUrl(31337, '0xabc')).toBeNull();
  });
});

describe('addresses', () => {
  it('reads addresses from either the public or server variable', () => {
    const fromPublic = readAddresses({ NEXT_PUBLIC_CONTRACT_ASSETS: ADDRESS });
    expect(fromPublic.assets).toBe(ADDRESS);
    const fromServer = readAddresses({ CONTRACT_ASSETS: ADDRESS });
    expect(fromServer.assets).toBe(ADDRESS);
  });

  it('falls back to the zero address for anything malformed', () => {
    for (const bad of [undefined, '', 'nope', '0x123']) {
      expect(readAddresses({ CONTRACT_ITEMS: bad }).items).toBe(ZERO_ADDRESS);
    }
  });

  it('reports an incomplete configuration rather than half-working', () => {
    expect(isConfigured(readAddresses({}))).toBe(false);
    expect(
      isConfigured(
        readAddresses({
          CONTRACT_ASSETS: ADDRESS,
          CONTRACT_ITEMS: ADDRESS,
          CONTRACT_MARKETPLACE: ADDRESS,
        }),
      ),
    ).toBe(true);
  });
});

describe('siwe', () => {
  const params = {
    domain: 'nova.example',
    address: ADDRESS,
    statement: SIWE_STATEMENT,
    uri: 'https://nova.example',
    version: '1' as const,
    chainId: 11155111,
    nonce: 'abcd1234efgh5678',
    issuedAt: '2026-01-01T00:00:00.000Z',
    expirationTime: '2026-01-01T00:05:00.000Z',
  };

  it('round-trips a built message', () => {
    const parsed = parseSiweMessage(buildSiweMessage(params));
    expect(parsed).not.toBeNull();
    expect(parsed?.address).toBe(ADDRESS);
    expect(parsed?.chainId).toBe(11155111);
    expect(parsed?.nonce).toBe(params.nonce);
    expect(parsed?.domain).toBe('nova.example');
    expect(parsed?.expirationTime).toBe(params.expirationTime);
  });

  it('rejects a malformed or truncated message', () => {
    expect(parseSiweMessage('')).toBeNull();
    expect(parseSiweMessage('hello')).toBeNull();
    expect(parseSiweMessage('a wants you to sign in with your Ethereum account:\nnot-an-address')).toBeNull();
  });

  it('rejects a message missing required fields', () => {
    const message = buildSiweMessage(params);
    const withoutNonce = message
      .split('\n')
      .filter((line) => !line.startsWith('Nonce: '))
      .join('\n');
    expect(parseSiweMessage(withoutNonce)).toBeNull();
  });

  it('rejects a nonce that is not a plain alphanumeric token', () => {
    const message = buildSiweMessage({ ...params, nonce: 'short' });
    expect(parseSiweMessage(message)).toBeNull();
    const injected = buildSiweMessage({ ...params, nonce: 'abcd1234efgh5678' }).replace(
      'Nonce: abcd1234efgh5678',
      'Nonce: ../../etc/passwd',
    );
    expect(parseSiweMessage(injected)).toBeNull();
  });

  it('rejects a non-numeric chain id', () => {
    const message = buildSiweMessage(params).replace('Chain ID: 11155111', 'Chain ID: mainnet');
    expect(parseSiweMessage(message)).toBeNull();
  });
});

describe('reward vouchers', () => {
  const voucher: Voucher = {
    to: ADDRESS,
    nonce: 42n,
    kind: REWARD_KIND.erc1155,
    collection: '0x2222222222222222222222222222222222222222',
    tokenId: 10n,
    amount: 3n,
    deadline: 1893456000n,
  };

  it('serialises bigints for transport and back again', () => {
    const wire = serialiseVoucher(voucher);
    expect(JSON.stringify(wire)).toContain('"nonce":"42"');
    expect(deserialiseVoucher(wire)).toEqual(voucher);
  });

  it('produces a signature that verifies against the same typed data', async () => {
    const account = privateKeyToAccount(`0x${'11'.repeat(32)}`);
    const typedData = voucherTypedData(11155111, '0x3333333333333333333333333333333333333333', voucher);
    const signature = await account.signTypedData(typedData);

    expect(await verifyTypedData({ ...typedData, address: account.address, signature })).toBe(true);
  });

  it('fails verification when any field is altered', async () => {
    const account = privateKeyToAccount(`0x${'11'.repeat(32)}`);
    const verifying = '0x3333333333333333333333333333333333333333' as const;
    const signature = await account.signTypedData(voucherTypedData(11155111, verifying, voucher));

    const tamperedAmount = voucherTypedData(11155111, verifying, { ...voucher, amount: 9999n });
    expect(await verifyTypedData({ ...tamperedAmount, address: account.address, signature })).toBe(false);

    const otherChain = voucherTypedData(31337, verifying, voucher);
    expect(await verifyTypedData({ ...otherChain, address: account.address, signature })).toBe(false);

    const otherContract = voucherTypedData(
      11155111,
      '0x4444444444444444444444444444444444444444',
      voucher,
    );
    expect(await verifyTypedData({ ...otherContract, address: account.address, signature })).toBe(false);
  });
});

describe('transaction status', () => {
  it('classifies terminal and busy phases', () => {
    expect(isTerminalPhase('confirmed')).toBe(true);
    expect(isTerminalPhase('rejected')).toBe(true);
    expect(isTerminalPhase('confirming')).toBe(false);
    expect(isBusyPhase('awaiting_wallet')).toBe(true);
    expect(isBusyPhase('idle')).toBe(false);
  });

  it('recognises a wallet rejection as distinct from a failure', () => {
    const result = describeTxError(new Error('User rejected the request.'));
    expect(result.phase).toBe('rejected');
    expect(result.message).toContain('dismissed');
  });

  it('explains insufficient funds and wrong-network errors plainly', () => {
    expect(describeTxError(new Error('insufficient funds for gas')).message).toContain('Not enough ETH');
    expect(describeTxError(new Error('Chain mismatch')).message).toContain('wrong network');
  });

  it('surfaces a contract custom error by name', () => {
    const result = describeTxError(new Error('execution reverted with ListingInactive(3)'));
    expect(result.phase).toBe('failed');
    expect(result.message).toContain('ListingInactive');
  });

  it('truncates an unrecognised error instead of dumping it', () => {
    const result = describeTxError(new Error('x'.repeat(500)));
    expect(result.message.length).toBeLessThanOrEqual(200);
  });
});
