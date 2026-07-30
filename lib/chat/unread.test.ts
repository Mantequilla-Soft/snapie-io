import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IChatUser } from '@/lib/db/models/ChatUser';

const aggregate = vi.fn();
const channelFind = vi.fn();

vi.mock('@/lib/db/models/Message', () => ({
  Message: { aggregate: (...args: unknown[]) => aggregate(...args) },
}));

vi.mock('@/lib/db/models/Channel', () => ({
  Channel: { find: (...args: unknown[]) => channelFind(...args) },
}));

import { computeUnread } from '@/lib/chat/unread';
import { encodeConversationKey } from '@/lib/chat/conversations';

/** Minimal stand-in for the Mongoose doc — computeUnread only reads these. */
function chatUser(overrides: Partial<{
  _id: string;
  channels: string[];
  blockedUsers: string[];
  mutedUsers: string[];
  seen: Record<string, Date>;
}> = {}): IChatUser {
  const seen = overrides.seen || {};
  return {
    _id: overrides._id ?? 'me',
    channels: overrides.channels ?? [],
    blockedUsers: overrides.blockedUsers ?? [],
    mutedUsers: overrides.mutedUsers ?? [],
    conversationSeen: { get: (k: string) => seen[k] },
  } as unknown as IChatUser;
}

/** The $match stage handed to Mongo on the last computeUnread call. */
function lastMatch(): any {
  return aggregate.mock.calls.at(-1)![0][0].$match;
}

function branchFor(target: string): any {
  return lastMatch().$or.find((b: any) => b.target === target);
}

beforeEach(() => {
  aggregate.mockReset().mockResolvedValue([]);
  // No private groups unless a test says otherwise.
  channelFind.mockReset().mockReturnValue({
    select: () => ({ lean: async () => [] }),
  });
});

describe('computeUnread', () => {
  it('is empty for a user with no conversations, without querying', async () => {
    const result = await computeUnread(chatUser());
    expect(result).toEqual({ byConversation: new Map(), total: 0 });
    expect(aggregate).not.toHaveBeenCalled();
  });

  it('is empty for a missing user', async () => {
    expect(await computeUnread(null)).toEqual({ byConversation: new Map(), total: 0 });
  });

  it('never counts your own messages, or muted/blocked senders', async () => {
    await computeUnread(chatUser({
      channels: ['general'],
      blockedUsers: ['spammer'],
      mutedUsers: ['loudmouth'],
    }));

    expect(lastMatch().sender).toEqual({ $nin: ['me', 'spammer', 'loudmouth'] });
  });

  it('only counts public-channel messages that mention or reply to you', async () => {
    await computeUnread(chatUser({ channels: ['general'] }));

    expect(branchFor('general')).toMatchObject({
      type: 'channel',
      $or: [{ mentions: 'me' }, { replyToSender: 'me' }],
    });
  });

  it('counts every message in a DM', async () => {
    await computeUnread(chatUser({ channels: ['dm:alice:me'] }));

    const branch = branchFor('dm:alice:me');
    expect(branch.type).toBe('dm');
    expect(branch.$or).toBeUndefined();
  });

  it('counts every message in a private group, like a DM', async () => {
    channelFind.mockReturnValue({
      select: () => ({ lean: async () => [{ _id: 'group-1' }] }),
    });

    await computeUnread(chatUser({ channels: ['group-1', 'general'] }));

    expect(branchFor('group-1').$or).toBeUndefined();
    expect(branchFor('general').$or).toBeDefined();
  });

  it('measures from the last read receipt when there is one', async () => {
    const seenAt = new Date('2026-07-01T00:00:00Z');
    await computeUnread(chatUser({
      channels: ['general', 'dm:alice:me'],
      seen: { general: seenAt },
    }));

    expect(branchFor('general').createdAt).toEqual({ $gt: seenAt });
    // Never read — no floor, so the whole thread is fair game.
    expect(branchFor('dm:alice:me').createdAt).toBeUndefined();
  });

  it('honours the receipt for a DM whose id contains a dot', async () => {
    // A dot is legal in a Hive username, so `dm:me:rashed.ifte` is an ordinary
    // conversation. Its receipt is stored under an escaped key, and reading it
    // back with the raw id would find nothing: the floor would vanish and the
    // whole thread would count as unread forever.
    const seenAt = new Date('2026-07-01T00:00:00Z');
    const id = 'dm:me:rashed.ifte';

    await computeUnread(chatUser({
      channels: [id],
      seen: { [encodeConversationKey(id)]: seenAt },
    }));

    expect(branchFor(id).createdAt).toEqual({ $gt: seenAt });
  });

  it('totals the per-conversation counts', async () => {
    aggregate.mockResolvedValue([
      { _id: 'dm:alice:me', count: 3 },
      { _id: 'general', count: 1 },
    ]);

    const result = await computeUnread(chatUser({ channels: ['general', 'dm:alice:me'] }));

    expect(result.total).toBe(4);
    expect(result.byConversation.get('dm:alice:me')).toBe(3);
    expect(result.byConversation.get('general')).toBe(1);
  });

  it('omits conversations with nothing unread', async () => {
    aggregate.mockResolvedValue([
      { _id: 'general', count: 0 },
      { _id: 'dm:alice:me', count: 2 },
    ]);

    const result = await computeUnread(chatUser({ channels: ['general', 'dm:alice:me'] }));

    expect(result.byConversation.has('general')).toBe(false);
    expect(result.total).toBe(2);
  });
});
