import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDmConversationId } from '@/lib/chat/conversations';

const { chatUser, channel, message } = vi.hoisted(() => ({
  chatUser: {
    findById: vi.fn(),
    updateOne: vi.fn(),
    updateMany: vi.fn(),
  },
  channel: {
    findById: vi.fn(),
    updateOne: vi.fn(),
  },
  message: {
    updateMany: vi.fn(),
  },
}));

vi.mock('@/lib/db/models/ChatUser', () => ({ ChatUser: chatUser }));
vi.mock('@/lib/db/models/Channel', () => ({ Channel: channel }));
vi.mock('@/lib/db/models/Message', () => ({ Message: message }));

import { currentChatId, mergeWarmupIdentity } from './graduation';

const OLD = '~aaaaaaaaaaaaaaaaaaaaaaaa';
const NEXT = 'alice';
const PEER = 'bob';

beforeEach(() => {
  vi.clearAllMocks();
  chatUser.updateOne.mockResolvedValue({});
  chatUser.updateMany.mockResolvedValue({});
  channel.updateOne.mockResolvedValue({});
  message.updateMany.mockResolvedValue({});
});

describe('mergeWarmupIdentity', () => {
  it('refuses ids that are not a warm-up graduating into a hive name', async () => {
    await expect(mergeWarmupIdentity('alice', 'bob')).resolves.toEqual({ merged: false, conversations: 0 });
    await expect(mergeWarmupIdentity(OLD, '~bbbbbbbbbbbbbbbbbbbbbbbb')).resolves.toEqual({ merged: false, conversations: 0 });
    await expect(mergeWarmupIdentity(OLD, OLD)).resolves.toEqual({ merged: false, conversations: 0 });
    expect(chatUser.findById).not.toHaveBeenCalled();
  });

  it('does nothing when the warm-up user is missing or already merged', async () => {
    chatUser.findById.mockResolvedValueOnce(null);
    await expect(mergeWarmupIdentity(OLD, NEXT)).resolves.toEqual({ merged: false, conversations: 0 });

    chatUser.findById.mockResolvedValueOnce({ mergedInto: 'someone', channels: [] });
    await expect(mergeWarmupIdentity(OLD, NEXT)).resolves.toEqual({ merged: false, conversations: 0 });
  });

  it('moves a DM, a channel, and mute lists onto the hive account', async () => {
    const dm = createDmConversationId(OLD, PEER);
    const seen = new Date('2026-10-01T00:00:00Z');
    const oldUser = {
      channels: [dm, 'lobby', `dm:${NEXT}:${NEXT}`],
      mutedUsers: ['carol'],
      blockedUsers: [],
      fcmTokens: ['tok'],
      conversationSeen: { get: () => seen },
    };
    chatUser.findById.mockImplementation(async (id: string) => {
      if (id === OLD) return oldUser;
      if (id === PEER) return { conversationSeen: { get: () => seen } };
      return null;
    });
    channel.findById.mockImplementation(async (id: string) => {
      if (id !== 'lobby') return null;
      return { members: [OLD, 'carol'], owner: OLD, createdBy: OLD };
    });

    const result = await mergeWarmupIdentity(OLD, NEXT);
    expect(result).toEqual({ merged: true, conversations: 2 });
    expect(message.updateMany).toHaveBeenCalledWith({ target: dm }, { $set: { target: createDmConversationId(NEXT, PEER) } });
    expect(message.updateMany).toHaveBeenCalledWith({ sender: OLD }, { $set: { sender: NEXT } });
    expect(channel.updateOne).toHaveBeenCalledWith(
      { _id: 'lobby' },
      { $set: { members: [NEXT, 'carol'] } },
    );
    expect(chatUser.updateOne).toHaveBeenCalledWith(
      { _id: OLD },
      { $set: { mergedInto: NEXT, mergedAt: expect.any(Date), channels: [], fcmTokens: [] } },
    );
  });

  it('pulls a duplicate member instead of inserting the hive name twice', async () => {
    const oldUser = {
      channels: ['lobby'],
      mutedUsers: [],
      blockedUsers: ['dave'],
      fcmTokens: [],
      conversationSeen: { get: () => null },
    };
    chatUser.findById.mockResolvedValue(oldUser);
    channel.findById.mockResolvedValue({ members: [NEXT, OLD], owner: 'carol', createdBy: 'carol' });
    await expect(mergeWarmupIdentity(OLD, NEXT)).resolves.toEqual({ merged: true, conversations: 1 });
    expect(channel.updateOne).toHaveBeenCalledWith(
      { _id: 'lobby' },
      { $pull: { members: OLD }, $inc: { memberCount: -1 } },
    );
  });
});

describe('currentChatId', () => {
  it('returns a hive name unchanged and follows a merged warm-up id', async () => {
    await expect(currentChatId('alice')).resolves.toBe('alice');
    chatUser.findById.mockReturnValue({ lean: async () => ({ mergedInto: 'alice' }) });
    await expect(currentChatId(OLD)).resolves.toBe('alice');
    chatUser.findById.mockReturnValue({ lean: async () => null });
    await expect(currentChatId(OLD)).resolves.toBe(OLD);
  });
});
