/**
 * Sign-In with Ethereum (EIP-4361).
 *
 * The message is built here and verified on the server with the same builder,
 * so what a wallet displays is exactly what the server checks. Nonces are
 * server-issued, single-use and short-lived, which is what stops a captured
 * signature being replayed.
 */
export interface SiweParams {
  readonly domain: string;
  readonly address: string;
  readonly statement: string;
  readonly uri: string;
  readonly version: '1';
  readonly chainId: number;
  readonly nonce: string;
  readonly issuedAt: string;
  readonly expirationTime: string;
}

export const SIWE_STATEMENT = 'Sign in to NOVA STATION. This request will not trigger a transaction.';

/** Signed-in sessions last this long before a fresh signature is required. */
export const SIWE_TTL_MS = 5 * 60 * 1000;

export function buildSiweMessage(params: SiweParams): string {
  return [
    `${params.domain} wants you to sign in with your Ethereum account:`,
    params.address,
    '',
    params.statement,
    '',
    `URI: ${params.uri}`,
    `Version: ${params.version}`,
    `Chain ID: ${params.chainId}`,
    `Nonce: ${params.nonce}`,
    `Issued At: ${params.issuedAt}`,
    `Expiration Time: ${params.expirationTime}`,
  ].join('\n');
}

export interface ParsedSiweMessage {
  readonly domain: string;
  readonly address: string;
  readonly uri: string;
  readonly version: string;
  readonly chainId: number;
  readonly nonce: string;
  readonly issuedAt: string;
  readonly expirationTime: string | null;
}

/**
 * Parses a SIWE message strictly.
 *
 * A permissive parser is a security bug: an attacker who can make the server
 * read a different address, chain or nonce than the wallet displayed can turn
 * one signature into a session for another account. Anything unexpected here
 * returns null rather than a best guess.
 */
export function parseSiweMessage(message: string): ParsedSiweMessage | null {
  const lines = message.split('\n');
  const header = lines[0];
  const address = lines[1];
  if (!header || !address) return null;

  const domainMatch = /^(.+) wants you to sign in with your Ethereum account:$/.exec(header);
  if (!domainMatch || !domainMatch[1]) return null;
  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) return null;

  const field = (label: string): string | null => {
    const line = lines.find((entry) => entry.startsWith(`${label}: `));
    return line ? line.slice(label.length + 2) : null;
  };

  const uri = field('URI');
  const version = field('Version');
  const chainIdRaw = field('Chain ID');
  const nonce = field('Nonce');
  const issuedAt = field('Issued At');
  if (!uri || !version || !chainIdRaw || !nonce || !issuedAt) return null;

  const chainId = Number(chainIdRaw);
  if (!Number.isInteger(chainId) || chainId <= 0) return null;
  if (!/^[A-Za-z0-9]{8,64}$/.test(nonce)) return null;

  return {
    domain: domainMatch[1],
    address,
    uri,
    version,
    chainId,
    nonce,
    issuedAt,
    expirationTime: field('Expiration Time'),
  };
}
