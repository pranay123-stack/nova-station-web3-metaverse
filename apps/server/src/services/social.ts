import { GameError } from '@nova/shared';
import type { Db } from '../db/client.js';

export interface FriendDto {
  readonly address: string;
  readonly displayName: string;
  readonly level: number;
  readonly lastSeenAt: string;
  readonly online: boolean;
}

export interface FriendRequestDto {
  readonly id: string;
  readonly address: string;
  readonly displayName: string;
  readonly direction: 'incoming' | 'outgoing';
  readonly createdAt: string;
}

const ONLINE_WINDOW_MS = 2 * 60 * 1000;

export async function listFriends(db: Db, userId: string): Promise<FriendDto[]> {
  const rows = await db.friendship.findMany({
    where: {
      status: 'accepted',
      OR: [{ requesterId: userId }, { addresseeId: userId }],
    },
    select: {
      requesterId: true,
      requester: { select: { address: true, displayName: true, level: true, lastSeenAt: true } },
      addressee: { select: { address: true, displayName: true, level: true, lastSeenAt: true } },
    },
  });

  const now = Date.now();
  return rows.map((row) => {
    const other = row.requesterId === userId ? row.addressee : row.requester;
    return {
      address: other.address,
      displayName: other.displayName,
      level: other.level,
      lastSeenAt: other.lastSeenAt.toISOString(),
      online: now - other.lastSeenAt.getTime() < ONLINE_WINDOW_MS,
    };
  });
}

export async function listRequests(db: Db, userId: string): Promise<FriendRequestDto[]> {
  const rows = await db.friendship.findMany({
    where: {
      status: 'pending',
      OR: [{ requesterId: userId }, { addresseeId: userId }],
    },
    select: {
      id: true,
      requesterId: true,
      createdAt: true,
      requester: { select: { address: true, displayName: true } },
      addressee: { select: { address: true, displayName: true } },
    },
  });

  return rows.map((row) => {
    const outgoing = row.requesterId === userId;
    const other = outgoing ? row.addressee : row.requester;
    return {
      id: row.id,
      address: other.address,
      displayName: other.displayName,
      direction: outgoing ? ('outgoing' as const) : ('incoming' as const),
      createdAt: row.createdAt.toISOString(),
    };
  });
}

/**
 * Sends a friend request.
 *
 * A request in the other direction is treated as an acceptance rather than
 * creating a mirrored pair, which keeps the relationship a single row and makes
 * "are we friends" one query.
 */
export async function requestFriend(db: Db, userId: string, address: string): Promise<void> {
  const target = await db.user.findUnique({ where: { address }, select: { id: true } });
  if (!target) throw new GameError('not_found', 'No commander with that address.');
  if (target.id === userId) throw new GameError('validation_failed', 'You cannot befriend yourself.');

  await db.$transaction(async (tx) => {
    const mirrored = await tx.friendship.findUnique({
      where: { requesterId_addresseeId: { requesterId: target.id, addresseeId: userId } },
      select: { id: true, status: true },
    });
    if (mirrored) {
      if (mirrored.status === 'accepted') throw new GameError('conflict', 'You are already friends.');
      if (mirrored.status === 'blocked') throw new GameError('forbidden', 'That request cannot be sent.');
      await tx.friendship.update({
        where: { id: mirrored.id },
        data: { status: 'accepted', respondedAt: new Date() },
      });
      return;
    }

    const existing = await tx.friendship.findUnique({
      where: { requesterId_addresseeId: { requesterId: userId, addresseeId: target.id } },
      select: { id: true, status: true },
    });
    if (existing) {
      if (existing.status === 'accepted') throw new GameError('conflict', 'You are already friends.');
      if (existing.status === 'pending') throw new GameError('conflict', 'That request is already pending.');
      await tx.friendship.update({
        where: { id: existing.id },
        data: { status: 'pending', respondedAt: null },
      });
      return;
    }

    await tx.friendship.create({
      data: { requesterId: userId, addresseeId: target.id, status: 'pending' },
    });
  });
}

export async function respondToRequest(
  db: Db,
  userId: string,
  requestId: string,
  action: 'accept' | 'decline' | 'cancel',
): Promise<void> {
  const row = await db.friendship.findUnique({
    where: { id: requestId },
    select: { id: true, requesterId: true, addresseeId: true, status: true },
  });
  if (!row || row.status !== 'pending') throw new GameError('not_found', 'No such pending request.');

  if (action === 'cancel') {
    if (row.requesterId !== userId) throw new GameError('forbidden', 'That is not your request.');
    await db.friendship.delete({ where: { id: row.id } });
    return;
  }

  if (row.addresseeId !== userId) throw new GameError('forbidden', 'That request is not addressed to you.');
  await db.friendship.update({
    where: { id: row.id },
    data: { status: action === 'accept' ? 'accepted' : 'declined', respondedAt: new Date() },
  });
}

export async function removeFriend(db: Db, userId: string, address: string): Promise<void> {
  const target = await db.user.findUnique({ where: { address }, select: { id: true } });
  if (!target) throw new GameError('not_found', 'No commander with that address.');

  const removed = await db.friendship.deleteMany({
    where: {
      status: 'accepted',
      OR: [
        { requesterId: userId, addresseeId: target.id },
        { requesterId: target.id, addresseeId: userId },
      ],
    },
  });
  if (removed.count === 0) throw new GameError('not_found', 'You are not friends with them.');
}

export async function areFriends(db: Db, userId: string, otherId: string): Promise<boolean> {
  const row = await db.friendship.findFirst({
    where: {
      status: 'accepted',
      OR: [
        { requesterId: userId, addresseeId: otherId },
        { requesterId: otherId, addresseeId: userId },
      ],
    },
    select: { id: true },
  });
  return row !== null;
}

export interface ChatMessageDto {
  readonly id: string;
  readonly address: string;
  readonly displayName: string;
  readonly channel: string;
  readonly text: string;
  readonly createdAt: string;
}

/** Persists a chat line. The gateway broadcasts; this is the record. */
export async function saveChat(
  db: Db,
  userId: string,
  channel: string,
  text: string,
  options: { area?: string; toUserId?: string } = {},
): Promise<ChatMessageDto> {
  const row = await db.chatMessage.create({
    data: {
      userId,
      channel,
      text,
      area: options.area ?? null,
      toUserId: options.toUserId ?? null,
    },
    select: {
      id: true,
      channel: true,
      text: true,
      createdAt: true,
      user: { select: { address: true, displayName: true } },
    },
  });
  return {
    id: row.id,
    address: row.user.address,
    displayName: row.user.displayName,
    channel: row.channel,
    text: row.text,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function recentChat(db: Db, channel: string, limit = 50): Promise<ChatMessageDto[]> {
  const rows = await db.chatMessage.findMany({
    where: { channel },
    orderBy: { createdAt: 'desc' },
    take: Math.min(limit, 100),
    select: {
      id: true,
      channel: true,
      text: true,
      createdAt: true,
      user: { select: { address: true, displayName: true } },
    },
  });
  return rows.reverse().map((row) => ({
    id: row.id,
    address: row.user.address,
    displayName: row.user.displayName,
    channel: row.channel,
    text: row.text,
    createdAt: row.createdAt.toISOString(),
  }));
}
