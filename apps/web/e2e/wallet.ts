import type { Page } from '@playwright/test';
import { privateKeyToAccount } from 'viem/accounts';

/**
 * A real signing wallet, injected into the page.
 *
 * The browser side is a minimal EIP-1193 provider that announces itself over
 * EIP-6963, exactly as MetaMask does. Signing is delegated back into Node
 * through an exposed function, where viem produces a genuine secp256k1
 * signature — so the server's SIWE verification is exercised for real rather
 * than stubbed out.
 *
 * Contract calls are not simulated: a test that needs a transaction should run
 * against anvil, and the contract behaviour itself is covered by the Foundry
 * suite.
 */
export interface TestWallet {
  readonly address: string;
}

/**
 * A key nobody has used before.
 *
 * The journey test walks a *new* player through their first session, and some
 * of what it checks — the starting contract, the arrival grant — happens only
 * once per account. Deriving a fresh key per run keeps every run a first run,
 * without needing to reset the database between them.
 */
export function freshWalletIndex(): bigint {
  return BigInt(Date.now()) * 1_000_000n + BigInt(Math.floor(Math.random() * 1_000_000));
}

export interface WalletOptions {
  /** The chain the wallet claims to be on. Defaults to the local anvil chain. */
  readonly chainId?: number;
}

export async function installWallet(
  page: Page,
  index = 1,
  options: WalletOptions = {},
): Promise<TestWallet> {
  const account = privateKeyToAccount(
    `0x${BigInt(index).toString(16).padStart(64, '0')}` as `0x${string}`,
  );

  await page.exposeFunction('__novaSign', async (message: string) =>
    account.signMessage({ message }),
  );

  await page.addInitScript(
    ({ address, chainIdHex }) => {
      const listeners = new Map<string, ((...args: unknown[]) => void)[]>();

      const provider = {
        isMetaMask: true,
        async request({ method, params }: { method: string; params?: unknown[] }) {
          switch (method) {
            case 'eth_requestAccounts':
            case 'eth_accounts':
              return [address];
            case 'eth_chainId':
              return chainIdHex;
            case 'net_version':
              return String(parseInt(chainIdHex, 16));
            case 'personal_sign': {
              const raw = (params?.[0] as string) ?? '';
              // Wallets receive the message hex-encoded; decode before signing.
              const message = raw.startsWith('0x')
                ? new TextDecoder().decode(
                    Uint8Array.from(
                      raw.slice(2).match(/.{1,2}/g)?.map((byte) => parseInt(byte, 16)) ?? [],
                    ),
                  )
                : raw;
              return (window as unknown as { __novaSign: (m: string) => Promise<string> }).__novaSign(
                message,
              );
            }
            case 'wallet_switchEthereumChain':
            case 'wallet_addEthereumChain':
              return null;
            case 'wallet_getPermissions':
            case 'wallet_requestPermissions':
              return [{ parentCapability: 'eth_accounts' }];
            case 'eth_getBlockByNumber':
              return { number: '0x1', timestamp: '0x0' };
            default:
              // A real wallet answers a wider surface than this game uses.
              // Logging rather than throwing keeps an unexpected call from
              // failing the connection for a method nobody cares about.
              console.warn('[test wallet] unhandled method', method);
              return null;
          }
        },
        on(event: string, handler: (...args: unknown[]) => void) {
          const list = listeners.get(event) ?? [];
          list.push(handler);
          listeners.set(event, list);
        },
        removeListener(event: string, handler: (...args: unknown[]) => void) {
          listeners.set(event, (listeners.get(event) ?? []).filter((entry) => entry !== handler));
        },
      };

      (window as unknown as { ethereum: unknown }).ethereum = provider;

      // EIP-6963: announce on request and once at load, which is how wagmi's
      // auto-discovery finds a wallet.
      const detail = {
        info: {
          uuid: '11111111-2222-3333-4444-555555555555',
          name: 'Nova Test Wallet',
          icon: 'data:image/svg+xml;base64,PHN2Zy8+',
          rdns: 'dev.nova.testwallet',
        },
        provider,
      };
      const announce = () =>
        window.dispatchEvent(
          new CustomEvent('eip6963:announceProvider', { detail: Object.freeze(detail) }),
        );
      window.addEventListener('eip6963:requestProvider', announce);
      announce();
    },
    { address: account.address, chainIdHex: `0x${(options.chainId ?? 31337).toString(16)}` },
  );

  return { address: account.address.toLowerCase() };
}
