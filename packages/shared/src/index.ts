export * from './errors.js';
export * from './item-registry.js';
export * from './protocol/common.js';
export * from './protocol/api.js';
export * from './protocol/ws.js';
export * from './contracts/index.js';
export * from './dto.js';

/** Bumped whenever the wire contract between client and server changes. */
export const SHARED_VERSION = '1.0.0';
