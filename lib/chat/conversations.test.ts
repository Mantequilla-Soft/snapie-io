import { describe, it, expect } from 'vitest';
import {
  conversationKeyPath,
  conversationSeenAt,
  conversationSeenPath,
  createDmConversationId,
  encodeConversationKey,
  isValidChannelId,
} from '@/lib/chat/conversations';

/** Stand-in for the Mongoose Map on a ChatUser doc. */
function seenMap(entries: Record<string, Date>) {
  return { conversationSeen: new Map(Object.entries(entries)) };
}

describe('encodeConversationKey', () => {
  it('leaves an ordinary id untouched, so receipts written before this existed still resolve', () => {
    expect(encodeConversationKey('general')).toBe('general');
    expect(encodeConversationKey('dm:alice:bob')).toBe('dm:alice:bob');
  });

  it('escapes the characters a Mongo update path cannot carry', () => {
    expect(encodeConversationKey('a.b')).toBe('a~2eb');
    expect(encodeConversationKey('a$b')).toBe('a~24b');
  });

  it('escapes its own escape character, so the mapping stays injective', () => {
    // Without this, 'a~2eb' and 'a.b' would both key to 'a~2eb' and two
    // conversations would share one read receipt.
    expect(encodeConversationKey('a~2eb')).toBe('a~7e2eb');
    expect(encodeConversationKey('a~2eb')).not.toBe(encodeConversationKey('a.b'));
  });
});

describe('conversationSeenPath', () => {
  it('gives a dotted DM id a path, which is the whole bug: dots are legal in Hive usernames', () => {
    const id = createDmConversationId('rashed.ifte', 'tibfox');
    expect(id).toBe('dm:rashed.ifte:tibfox');
    expect(conversationSeenPath(id)).toBe('conversationSeen.dm:rashed~2eifte:tibfox');
  });

  it('addresses exactly one key, never a nested field', () => {
    const path = conversationSeenPath(createDmConversationId('rashed.ifte', 'some.body'));
    expect(path.split('.')).toHaveLength(2);
    expect(path.startsWith('conversationSeen.')).toBe(true);
  });

  it('does not care which side of the DM holds the dot, because the pair is sorted', () => {
    expect(conversationSeenPath(createDmConversationId('rashed.ifte', 'tibfox')))
      .toBe(conversationSeenPath(createDmConversationId('tibfox', 'rashed.ifte')));
  });
});

describe('conversationKeyPath', () => {
  it('escapes for the other conversation-keyed maps too, which had the same raw interpolation', () => {
    const id = createDmConversationId('rashed.ifte', 'tibfox');
    expect(conversationKeyPath('typingAt', id)).toBe('typingAt.dm:rashed~2eifte:tibfox');
    expect(conversationKeyPath('memoNotifyAt', id)).toBe('memoNotifyAt.dm:rashed~2eifte:tibfox');
    expect(conversationKeyPath('typingAt', id).split('.')).toHaveLength(2);
  });
});

describe('conversationSeenAt', () => {
  it('reads back what the update path wrote', () => {
    const id = createDmConversationId('rashed.ifte', 'tibfox');
    const at = new Date('2026-07-30T00:00:00Z');
    // What Mongo stores for `$set: { [conversationSeenPath(id)]: at }`.
    const key = conversationSeenPath(id).replace('conversationSeen.', '');

    expect(conversationSeenAt(seenMap({ [key]: at }), id)).toEqual(at);
  });

  it('is null for a conversation that was never read', () => {
    expect(conversationSeenAt(seenMap({}), 'general')).toBeNull();
  });

  it('is null for a missing user or a doc with no map', () => {
    expect(conversationSeenAt(null, 'general')).toBeNull();
    expect(conversationSeenAt({}, 'general')).toBeNull();
  });
});

describe('isValidChannelId', () => {
  it('keeps caller-chosen channel ids plain, since they travel in URLs and FCM topics', () => {
    expect(isValidChannelId('general')).toBe(true);
    expect(isValidChannelId('a.b')).toBe(false);
    expect(isValidChannelId('a$b')).toBe(false);
    expect(isValidChannelId('')).toBe(false);
  });
});
