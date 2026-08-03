import { describe, it, expect } from 'vitest';
import { extractMentions, messageMentionsUser, normalizeMentionToken, getActiveMentionDraft } from '@/lib/chat/mentions';

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

describe('getActiveMentionDraft', () => {
  it('finds the partial mention the cursor is inside of', () => {
    const text = 'hey @bo';
    expect(getActiveMentionDraft(text, text.length)).toEqual({ start: 4, end: 7, query: 'bo' });
  });

  it('is null when the cursor is not touching an @-partial', () => {
    expect(getActiveMentionDraft('just talking, no mentions here', 10)).toBeNull();
  });

  it('is null for a mention elsewhere in the text, cursor not adjacent to it', () => {
    // Cursor sits right after "and", nowhere near the earlier @alice.
    const text = 'hey @alice and ';
    expect(getActiveMentionDraft(text, 'hey @alice and'.length)).toBeNull();
  });

  it('requires the @ to start at a word boundary (start-of-string or whitespace)', () => {
    expect(getActiveMentionDraft('email@bo', 8)).toBeNull();
  });

  it('works mid-way through multi-line text, not just at the very end', () => {
    const text = 'first line\nhey @bo';
    expect(getActiveMentionDraft(text, text.length)).toEqual({ start: 15, end: 18, query: 'bo' });
  });

  it('is null past the end of the content', () => {
    expect(getActiveMentionDraft('hey @bo', 999)).toBeNull();
  });
});
