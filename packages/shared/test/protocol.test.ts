import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { COSMETICS_BY_ID, EQUIPMENT_BY_ID, MODULES_BY_ID, SHIPS_BY_ID } from '@nova/game-data';
import {
  CLIENT_RATE_LIMITS,
  ERROR_STATUS,
  GameError,
  ITEM_BY_TOKEN_ID,
  MAX_FRAME_BYTES,
  NovaMarketplaceAbi,
  NovaRewardVaultAbi,
  ON_CHAIN_ITEMS,
  ON_CHAIN_SHIP_DEFS,
  TOKEN_ID_BY_DEF,
  addressSchema,
  avatarSchema,
  chatSendSchema,
  clientMessageSchema,
  createCreditListingSchema,
  decodeClientMessage,
  displayNameSchema,
  extractSchema,
  isOnChainItem,
  onChainItemName,
  playerTextSchema,
  quantiseAngle,
  quantisePosition,
  refineSchema,
  shipNameSchema,
  vec3Schema,
} from '../src/index.js';

const here = dirname(fileURLToPath(import.meta.url));

/** Builds a string containing a control character without embedding one here. */
const withControlChar = (code: number, text: string): string =>
  `${text}${String.fromCharCode(code)}${text}`;

describe('address and text validation', () => {
  it('accepts a well-formed address and lowercases it', () => {
    expect(addressSchema.parse('0xAbCdEf0123456789AbCdEf0123456789AbCdEf01')).toBe(
      '0xabcdef0123456789abcdef0123456789abcdef01',
    );
  });

  it('rejects malformed addresses', () => {
    for (const bad of ['', '0x', 'abc', '0x123', `0x${'0'.repeat(41)}`, 'not-an-address']) {
      expect(addressSchema.safeParse(bad).success, bad).toBe(false);
    }
  });

  it('rejects control characters in player text', () => {
    const schema = playerTextSchema(100);
    expect(schema.safeParse('hello commander').success).toBe(true);
    // NUL, BEL, ESC and a raw newline are all rejected: each is a way to spoof
    // a chat line or corrupt a downstream log.
    for (const code of [0, 7, 10, 13, 27, 127]) {
      expect(schema.safeParse(withControlChar(code, 'spoof')).success, `code ${code}`).toBe(false);
    }
  });

  it('bounds text length after trimming', () => {
    const schema = playerTextSchema(10);
    expect(schema.safeParse('   ').success).toBe(false);
    expect(schema.safeParse('a'.repeat(11)).success).toBe(false);
    expect(schema.parse('  hi  ')).toBe('hi');
  });

  it('constrains display and ship names to safe characters', () => {
    expect(displayNameSchema.safeParse('Commander_7').success).toBe(true);
    expect(displayNameSchema.safeParse('<script>').success).toBe(false);
    expect(displayNameSchema.safeParse('ab').success).toBe(false);
    expect(shipNameSchema.safeParse("Alice's Folly").success).toBe(true);
    expect(shipNameSchema.safeParse('drop; table').success).toBe(false);
  });
});

describe('api schemas', () => {
  it('rejects a non-finite position', () => {
    expect(vec3Schema.safeParse({ x: 0, y: 0, z: 0 }).success).toBe(true);
    expect(vec3Schema.safeParse({ x: Infinity, y: 0, z: 0 }).success).toBe(false);
    expect(vec3Schema.safeParse({ x: Number.NaN, y: 0, z: 0 }).success).toBe(false);
  });

  it('bounds the minigame tick claim before it reaches the engine', () => {
    const base = { expeditionId: '3f2504e0-4f89-11d3-9a0c-0305e82c3301', nodeIndex: 3 };
    expect(extractSchema.safeParse({ ...base, holdTicks: 50 }).success).toBe(true);
    expect(extractSchema.safeParse({ ...base, holdTicks: -1 }).success).toBe(false);
    expect(extractSchema.safeParse({ ...base, holdTicks: 1e9 }).success).toBe(false);
    expect(extractSchema.safeParse({ ...base, holdTicks: 1.5 }).success).toBe(false);
  });

  it('rejects an oversized or empty refine batch', () => {
    expect(refineSchema.safeParse({ batch: [] }).success).toBe(false);
    expect(
      refineSchema.safeParse({
        batch: Array.from({ length: 7 }, () => ({ resource: 'iron', amount: 1 })),
      }).success,
    ).toBe(false);
    expect(refineSchema.safeParse({ batch: [{ resource: 'iron', amount: 10 }] }).success).toBe(true);
    expect(refineSchema.safeParse({ batch: [{ resource: 'gold', amount: 10 }] }).success).toBe(false);
  });

  it('requires a recipient for direct messages', () => {
    expect(chatSendSchema.safeParse({ channel: 'station', text: 'hi' }).success).toBe(true);
    expect(chatSendSchema.safeParse({ channel: 'direct', text: 'hi' }).success).toBe(false);
    expect(
      chatSendSchema.safeParse({
        channel: 'direct',
        to: '0xabcdef0123456789abcdef0123456789abcdef01',
        text: 'hi',
      }).success,
    ).toBe(true);
  });

  it('rejects a zero or negative listing price', () => {
    const base = { kind: 'module', defId: 'ion_thruster', amount: 1 };
    expect(createCreditListingSchema.safeParse({ ...base, price: 100 }).success).toBe(true);
    expect(createCreditListingSchema.safeParse({ ...base, price: 0 }).success).toBe(false);
    expect(createCreditListingSchema.safeParse({ ...base, price: -5 }).success).toBe(false);
  });

  it('requires a full avatar with valid colours', () => {
    const avatar = {
      displayName: 'Nova Pilot',
      suitId: 'suit_standard',
      helmetId: 'helmet_standard',
      suitPattern: 'pattern_plain',
      visor: 'visor_ice',
      emblem: 'emblem_federation',
      accessory: 'accessory_pack',
      primaryColor: '#38bdf8',
      secondaryColor: '#0ea5e9',
    };
    expect(avatarSchema.safeParse(avatar).success).toBe(true);
    expect(avatarSchema.safeParse({ ...avatar, primaryColor: 'blue' }).success).toBe(false);
    expect(avatarSchema.safeParse({ ...avatar, suitId: 'Suit Standard' }).success).toBe(false);
  });
});

describe('websocket protocol', () => {
  it('decodes a valid move frame', () => {
    const frame = JSON.stringify({ t: 'move', p: { x: 1, y: 0, z: 2 }, y: 0.5, s: 'walk', ts: 1000 });
    expect(decodeClientMessage(frame)?.t).toBe('move');
  });

  it('returns null for junk, oversized and unknown frames', () => {
    expect(decodeClientMessage('not json')).toBeNull();
    expect(decodeClientMessage(JSON.stringify({ t: 'admin_grant_credits' }))).toBeNull();
    expect(decodeClientMessage('x'.repeat(MAX_FRAME_BYTES + 1))).toBeNull();
    expect(decodeClientMessage(JSON.stringify({ t: 'move' }))).toBeNull();
  });

  it('rejects a move frame carrying a non-finite position', () => {
    const frame = JSON.stringify({ t: 'move', p: { x: 1, y: null, z: 2 }, y: 0, s: 'walk', ts: 1 });
    expect(decodeClientMessage(frame)).toBeNull();
  });

  it('rejects an unknown movement state or emote', () => {
    expect(
      clientMessageSchema.safeParse({
        t: 'move',
        p: { x: 0, y: 0, z: 0 },
        y: 0,
        s: 'teleport',
        ts: 0,
      }).success,
    ).toBe(false);
    expect(clientMessageSchema.safeParse({ t: 'emote', e: 'explode' }).success).toBe(false);
  });

  it('has a rate limit for every client message type', () => {
    for (const type of ['move', 'emote', 'chat', 'area', 'ping'] as const) {
      const limit = CLIENT_RATE_LIMITS[type];
      expect(limit.perSecond).toBeGreaterThan(0);
      expect(limit.burst).toBeGreaterThanOrEqual(limit.perSecond);
    }
  });

  it('quantises positions and angles to a fixed precision', () => {
    expect(quantisePosition(1.23456)).toBe(1.23);
    expect(quantiseAngle(0.123456)).toBe(0.123);
  });
});

describe('errors', () => {
  it('maps every code to a sensible status', () => {
    for (const [code, status] of Object.entries(ERROR_STATUS)) {
      expect(status, code).toBeGreaterThanOrEqual(400);
      expect(status, code).toBeLessThan(600);
    }
  });

  it('serialises to a stable body', () => {
    const error = new GameError('insufficient_credits', 'Not enough credits', { need: 100 });
    expect(error.status).toBe(400);
    expect(error.toBody()).toEqual({
      error: { code: 'insufficient_credits', message: 'Not enough credits', details: { need: 100 } },
    });
  });

  it('omits details when there are none', () => {
    expect(new GameError('not_found', 'gone').toBody().error).not.toHaveProperty('details');
  });
});

describe('on-chain item registry', () => {
  it('has unique token ids and def ids', () => {
    expect(new Set(ON_CHAIN_ITEMS.map((i) => i.tokenId)).size).toBe(ON_CHAIN_ITEMS.length);
    expect(new Set(ON_CHAIN_ITEMS.map((i) => i.defId)).size).toBe(ON_CHAIN_ITEMS.length);
  });

  it('resolves every entry to a real, on-chain-eligible game item', () => {
    for (const item of ON_CHAIN_ITEMS) {
      const found =
        item.kind === 'module'
          ? MODULES_BY_ID.get(item.defId)
          : item.kind === 'equipment'
            ? EQUIPMENT_BY_ID.get(item.defId)
            : COSMETICS_BY_ID.get(item.defId);
      expect(found, `${item.kind}:${item.defId}`).toBeDefined();
      expect(found?.onChainEligible, `${item.defId} must be on-chain eligible`).toBe(true);
      expect(onChainItemName(item.tokenId)).toBe(found?.name);
    }
  });

  it('resolves every on-chain ship to a real hull', () => {
    for (const defId of ON_CHAIN_SHIP_DEFS) {
      expect(SHIPS_BY_ID.get(defId), defId).toBeDefined();
    }
  });

  it('keeps its lookups in agreement', () => {
    for (const item of ON_CHAIN_ITEMS) {
      expect(TOKEN_ID_BY_DEF.get(item.defId)).toBe(item.tokenId);
      expect(ITEM_BY_TOKEN_ID.get(item.tokenId)?.defId).toBe(item.defId);
      expect(isOnChainItem(item.defId)).toBe(true);
    }
    expect(isOnChainItem('iron')).toBe(false);
    expect(onChainItemName(9999)).toBeNull();
  });

  it('matches the ids the deploy script registers on chain', () => {
    // The one place TypeScript and Solidity could silently drift. If they ever
    // disagree, a player's on-chain item would resolve to the wrong game item,
    // so the registry is compared against the deploy script directly.
    const script = readFileSync(resolve(here, '../../../contracts/script/Deploy.s.sol'), 'utf8');
    const pattern =
      /items\.registerItem\(\s*(\d+),\s*bytes32\("([a-z]+)"\),\s*bytes32\("([a-z0-9_]+)"\)/g;
    const registered = [...script.matchAll(pattern)].map((match) => ({
      tokenId: Number(match[1]),
      kind: match[2],
      defId: match[3],
    }));

    expect(registered.length).toBe(ON_CHAIN_ITEMS.length);
    for (const item of ON_CHAIN_ITEMS) {
      const onChain = registered.find((r) => r.tokenId === item.tokenId);
      expect(onChain, `token ${item.tokenId} is not registered by Deploy.s.sol`).toBeDefined();
      expect(onChain?.defId).toBe(item.defId);
      expect(onChain?.kind).toBe(item.kind);
    }
  });
});

describe('contract ABIs', () => {
  it('exports the functions the client depends on', () => {
    const marketFns = NovaMarketplaceAbi.filter((e) => e.type === 'function').map((e) =>
      'name' in e ? e.name : '',
    );
    for (const fn of ['list', 'buy', 'cancel', 'withdraw', 'getListing', 'quote']) {
      expect(marketFns, fn).toContain(fn);
    }
    const vaultFns = NovaRewardVaultAbi.filter((e) => e.type === 'function').map((e) =>
      'name' in e ? e.name : '',
    );
    expect(vaultFns).toContain('redeem');
    expect(vaultFns).toContain('hashVoucher');
  });

  it('exports the events the indexer subscribes to', () => {
    const events = NovaMarketplaceAbi.filter((e) => e.type === 'event').map((e) =>
      'name' in e ? e.name : '',
    );
    for (const event of ['Listed', 'Sold', 'Cancelled', 'PriceUpdated']) {
      expect(events, event).toContain(event);
    }
  });
});
