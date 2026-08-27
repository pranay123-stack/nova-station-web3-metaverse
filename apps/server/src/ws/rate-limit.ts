import { CLIENT_RATE_LIMITS, type ClientMessageType } from '@nova/shared';

/**
 * Per-connection token buckets.
 *
 * One bucket per message type, so a client flooding `move` cannot also starve
 * its own chat allowance, and a chat flood cannot be hidden inside a burst of
 * position updates.
 */
export class MessageRateLimiter {
  private readonly buckets = new Map<ClientMessageType, { tokens: number; last: number }>();
  private violations = 0;

  constructor(private readonly now: () => number = Date.now) {}

  /** Consumes one token. Returns false when the client is over budget. */
  allow(type: ClientMessageType): boolean {
    const limit = CLIENT_RATE_LIMITS[type];
    const timestamp = this.now();
    const bucket = this.buckets.get(type) ?? { tokens: limit.burst, last: timestamp };

    const elapsed = (timestamp - bucket.last) / 1000;
    bucket.tokens = Math.min(limit.burst, bucket.tokens + elapsed * limit.perSecond);
    bucket.last = timestamp;

    if (bucket.tokens < 1) {
      this.buckets.set(type, bucket);
      this.violations += 1;
      return false;
    }

    bucket.tokens -= 1;
    this.buckets.set(type, bucket);
    return true;
  }

  violationCount(): number {
    return this.violations;
  }

  /** True once a client has misbehaved often enough to be disconnected. */
  shouldDisconnect(threshold = 40): boolean {
    return this.violations >= threshold;
  }
}
