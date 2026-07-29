import { describe, it, expect } from 'vitest';
import { extractMentions, messageMentionsUser, normalizeMentionToken } from '@/lib/chat/mentions';

describe('normalizeMentionToken', () => {
  it('strips the @ and lowercases', () => {
    expect(normalizeMentionToken('@Alice')).toBe('alice');
  });

  it('strips trailing sentence punctuation that is not part of a username', () => {
    expect(normalizeMentionToken('@alice.')).toBe('alice');
    expect(normalizeMentionToken('@alice-')).toBe('alice');
  });

  it('keeps dots and dashes inside a username', () => {
    expect(normalizeMentionToken('@alice.the-great')).toBe('alice.the-great');
  });
});

describe('extractMentions', () => {
  it('returns every distinct mention', () => {
    expect(extractMentions('hey @alice and @bob, cc @alice')).toEqual(['alice', 'bob']);
  });

  it('returns nothing for a message with no mentions', () => {
    expect(extractMentions('just some chatter in general')).toEqual([]);
    expect(extractMentions('')).toEqual([]);
  });

  it('handles a mention at the end of a sentence', () => {
    expect(extractMentions('thanks @alice.')).toEqual(['alice']);
  });
});

describe('messageMentionsUser', () => {
  it('matches regardless of case', () => {
    expect(messageMentionsUser('ping @Alice', 'alice')).toBe(true);
    expect(messageMentionsUser('ping @alice', 'Alice')).toBe(true);
  });

  it('does not match a different user whose name is a prefix', () => {
    expect(messageMentionsUser('ping @alicia', 'alice')).toBe(false);
  });

  it('is false without a username', () => {
    expect(messageMentionsUser('ping @alice', null)).toBe(false);
  });
});
