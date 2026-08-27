import { z } from 'zod';
import {
  addressSchema,
  defIdSchema,
  displayNameSchema,
  factionIdSchema,
  hexSignatureSchema,
  itemKindSchema,
  nonNegativeIntSchema,
  paginationSchema,
  playerTextSchema,
  positiveIntSchema,
  resourceIdSchema,
  shipNameSchema,
  stationAreaSchema,
  txHashSchema,
  vec3Schema,
} from './common.js';

/* ------------------------------------------------------------------ auth */

export const nonceRequestSchema = z.object({ address: addressSchema });

export const siweVerifySchema = z.object({
  message: z.string().min(1).max(4000),
  signature: hexSignatureSchema,
});

export type SiweVerifyRequest = z.infer<typeof siweVerifySchema>;

/* ---------------------------------------------------------------- avatar */

export const avatarSchema = z.object({
  displayName: displayNameSchema,
  suitId: defIdSchema,
  helmetId: defIdSchema,
  suitPattern: defIdSchema,
  visor: defIdSchema,
  emblem: defIdSchema,
  accessory: defIdSchema,
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  secondaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
});

export type AvatarDto = z.infer<typeof avatarSchema>;

/* ----------------------------------------------------------------- ships */

export const shipStatSchema = z.enum([
  'speed',
  'cargo',
  'fuel',
  'miningPower',
  'defense',
  'sensors',
]);

export const selectShipSchema = z.object({ shipId: z.string().uuid() });

export const renameShipSchema = z.object({
  shipId: z.string().uuid(),
  name: shipNameSchema,
});

export const buyShipSchema = z.object({ defId: defIdSchema });

export const upgradeShipSchema = z.object({
  shipId: z.string().uuid(),
  stat: shipStatSchema,
});

export const equipModuleSchema = z.object({
  shipId: z.string().uuid(),
  moduleId: defIdSchema,
  slotIndex: z.number().int().min(0).max(7),
});

export const unequipModuleSchema = z.object({
  shipId: z.string().uuid(),
  slotIndex: z.number().int().min(0).max(7),
});

export const refuelSchema = z.object({
  shipId: z.string().uuid(),
  amount: positiveIntSchema.max(1000),
});

/* ------------------------------------------------------------- inventory */

export const equipItemSchema = z.object({
  kind: z.enum(['equipment', 'cosmetic']),
  defId: defIdSchema,
});

export const inventoryQuerySchema = z
  .object({
    kind: itemKindSchema.optional(),
    search: z.string().max(48).optional(),
  })
  .merge(paginationSchema);

/* -------------------------------------------------------------- missions */

export const acceptMissionSchema = z.object({ missionId: defIdSchema });
export const abandonMissionSchema = z.object({ playerMissionId: z.string().uuid() });
export const claimMissionSchema = z.object({ playerMissionId: z.string().uuid() });

/* ---------------------------------------------------------------- mining */

export const startExpeditionSchema = z.object({
  zoneId: defIdSchema,
  shipId: z.string().uuid(),
});

export const extractSchema = z.object({
  expeditionId: z.string().uuid(),
  /** Client-side identifier of the asteroid being mined; each may be mined once. */
  nodeIndex: z.number().int().min(0).max(255),
  /** Minigame ticks the client claims it held the resonance band. */
  holdTicks: nonNegativeIntSchema.max(10_000),
});

export const scanSchema = z.object({
  expeditionId: z.string().uuid(),
  nodeIndex: z.number().int().min(0).max(255),
});

export const returnExpeditionSchema = z.object({ expeditionId: z.string().uuid() });

export const refineSchema = z.object({
  batch: z
    .array(z.object({ resource: resourceIdSchema, amount: positiveIntSchema.max(100_000) }))
    .min(1)
    .max(6),
});

/* -------------------------------------------------------------- crafting */

export const startCraftSchema = z.object({ recipeId: defIdSchema });
export const collectCraftSchema = z.object({ craftId: z.string().uuid() });

/* ----------------------------------------------------------- marketplace */

export const listingQuerySchema = z
  .object({
    category: z.enum(['ship', 'module', 'equipment', 'cosmetic', 'collectible']).optional(),
    rarity: z.enum(['common', 'uncommon', 'rare', 'epic', 'legendary']).optional(),
    sort: z.enum(['price_asc', 'price_desc', 'newest', 'rarity']).default('newest'),
    onChainOnly: z.coerce.boolean().default(false),
  })
  .merge(paginationSchema);

/** An off-chain listing paid for in credits. */
export const createCreditListingSchema = z.object({
  kind: itemKindSchema,
  defId: defIdSchema,
  amount: positiveIntSchema.max(9999),
  price: positiveIntSchema,
});

export const buyCreditListingSchema = z.object({ listingId: z.string().uuid() });
export const cancelCreditListingSchema = z.object({ listingId: z.string().uuid() });

/** Station broker: instant sale of raw resources at the spread. */
export const brokerTradeSchema = z.object({
  resource: resourceIdSchema,
  amount: positiveIntSchema.max(1_000_000),
});

/* -------------------------------------------------------------- on-chain */

export const mintRequestSchema = z.object({
  kind: itemKindSchema,
  defId: defIdSchema,
  amount: positiveIntSchema.max(100).default(1),
});

export const linkTxSchema = z.object({
  txHash: txHashSchema,
  intent: z.enum(['mint', 'list', 'buy', 'cancel', 'redeem', 'withdraw']),
});

/* ---------------------------------------------------------------- social */

export const friendRequestSchema = z.object({ address: addressSchema });

export const friendActionSchema = z.object({
  requestId: z.string().uuid(),
  action: z.enum(['accept', 'decline', 'cancel']),
});

export const removeFriendSchema = z.object({ address: addressSchema });

export const chatSendSchema = z
  .object({
    channel: z.enum(['station', 'area', 'direct']),
    to: addressSchema.optional(),
    text: playerTextSchema(240),
  })
  .refine((value) => value.channel !== 'direct' || value.to !== undefined, {
    message: 'direct messages require a recipient',
    path: ['to'],
  });

/* ------------------------------------------------------------- telemetry */

export const enterAreaSchema = z.object({
  area: stationAreaSchema,
  position: vec3Schema,
});

export const interactSchema = z.object({
  interactableId: z.string().min(1).max(64),
  position: vec3Schema,
});

/* ----------------------------------------------------------- leaderboard */

export const leaderboardQuerySchema = z.object({
  metric: z.enum(['level', 'credits', 'missions', 'reputation', 'mined']).default('level'),
  faction: factionIdSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

export const profileParamsSchema = z.object({ address: addressSchema });
