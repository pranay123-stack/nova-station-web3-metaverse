/** Stable error codes shared by the API, the WebSocket gateway and the client. */
export const ERROR_CODES = [
  'unauthorized',
  'forbidden',
  'not_found',
  'validation_failed',
  'rate_limited',
  'conflict',
  'insufficient_credits',
  'insufficient_resources',
  'insufficient_level',
  'insufficient_reputation',
  'insufficient_cargo',
  'insufficient_fuel',
  'not_owned',
  'already_active',
  'not_active',
  'cooldown',
  'expired',
  'too_far_away',
  'area_locked',
  'busy',
  'invalid_state',
  'chain_error',
  'internal_error',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export interface ApiErrorBody {
  readonly error: {
    readonly code: ErrorCode;
    readonly message: string;
    readonly details?: unknown;
  };
}

/** HTTP status that best represents each error code. */
export const ERROR_STATUS: Readonly<Record<ErrorCode, number>> = {
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  validation_failed: 400,
  rate_limited: 429,
  conflict: 409,
  insufficient_credits: 400,
  insufficient_resources: 400,
  insufficient_level: 403,
  insufficient_reputation: 403,
  insufficient_cargo: 400,
  insufficient_fuel: 400,
  not_owned: 403,
  already_active: 409,
  not_active: 409,
  cooldown: 429,
  expired: 410,
  too_far_away: 400,
  area_locked: 403,
  busy: 409,
  invalid_state: 409,
  chain_error: 502,
  internal_error: 500,
};

/** A domain failure that the API layer knows how to serialise. */
export class GameError extends Error {
  readonly code: ErrorCode;
  readonly details: unknown;

  constructor(code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = 'GameError';
    this.code = code;
    this.details = details;
  }

  get status(): number {
    return ERROR_STATUS[this.code];
  }

  toBody(): ApiErrorBody {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.details === undefined ? {} : { details: this.details }),
      },
    };
  }
}
