import { verifyMessage } from 'viem';
import { SIWE_STATEMENT, SIWE_TTL_MS, buildSiweMessage, parseSiweMessage } from '@nova/web3';
import { GameError } from '@nova/shared';
import { env } from '../env.js';
import { randomNonce, sha256 } from '../lib/ids.js';
import type { Db } from '../db/client.js';

/**
 * Sign-In with Ethereum.
 *
 * Four checks make a signature usable as a login, and all four matter:
 *
 *  - the signature recovers to the address the message names,
 *  - the nonce was issued by this server, is unused, and has not expired,
 *  - the domain and chain id match this deployment,
 *  - the message has not expired on its own terms.
 *
 * Drop any one and a signature captured elsewhere becomes a session here.
 */
export interface SiweChallenge {
  readonly nonce: string;
  readonly message: string;
  readonly expiresAt: Date;
}

export async function issueChallenge(db: Db, address: string): Promise<SiweChallenge> {
  const config = env();
  const nonce = randomNonce();
  const issuedAt = new Date();
  const expiresAt = new Date(issuedAt.getTime() + SIWE_TTL_MS);

  // One live challenge per address: issuing a new one retires the old.
  await db.authNonce.updateMany({
    where: { address, usedAt: null },
    data: { usedAt: issuedAt },
  });

  await db.authNonce.create({
    data: { address, nonce, expiresAt },
  });

  const message = buildSiweMessage({
    domain: config.SIWE_DOMAIN,
    address,
    statement: SIWE_STATEMENT,
    uri: config.PUBLIC_WEB_ORIGIN,
    version: '1',
    chainId: config.CHAIN_ID,
    nonce,
    issuedAt: issuedAt.toISOString(),
    expirationTime: expiresAt.toISOString(),
  });

  return { nonce, message, expiresAt };
}

export interface VerifiedLogin {
  readonly address: string;
  readonly chainId: number;
}

export async function verifyChallenge(
  db: Db,
  message: string,
  signature: `0x${string}`,
): Promise<VerifiedLogin> {
  const config = env();
  const parsed = parseSiweMessage(message);
  if (!parsed) {
    throw new GameError('validation_failed', 'Malformed sign-in message.');
  }

  if (parsed.domain !== config.SIWE_DOMAIN) {
    throw new GameError('unauthorized', 'Sign-in message was issued for a different site.');
  }
  if (parsed.chainId !== config.CHAIN_ID) {
    throw new GameError('unauthorized', 'Sign-in message was issued for a different chain.');
  }
  if (parsed.expirationTime && new Date(parsed.expirationTime).getTime() < Date.now()) {
    throw new GameError('expired', 'Sign-in message has expired. Try again.');
  }

  const address = parsed.address.toLowerCase();

  // Consume the nonce first, atomically. A second request carrying the same
  // signature finds nothing to consume and is rejected, which closes the replay
  // window even under concurrent requests.
  const consumed = await db.authNonce.updateMany({
    where: {
      nonce: parsed.nonce,
      address,
      usedAt: null,
      expiresAt: { gt: new Date() },
    },
    data: { usedAt: new Date() },
  });
  if (consumed.count !== 1) {
    throw new GameError('unauthorized', 'Sign-in nonce is unknown, used or expired.');
  }

  const valid = await verifyMessage({
    address: address as `0x${string}`,
    message,
    signature,
  });
  if (!valid) {
    throw new GameError('unauthorized', 'Signature does not match the signing address.');
  }

  return { address, chainId: parsed.chainId };
}

/** Removes expired and consumed challenges. Called periodically. */
export async function pruneNonces(db: Db): Promise<number> {
  const cutoff = new Date(Date.now() - SIWE_TTL_MS * 4);
  const result = await db.authNonce.deleteMany({
    where: { OR: [{ expiresAt: { lt: new Date() } }, { usedAt: { lt: cutoff } }] },
  });
  return result.count;
}

export { sha256 };
