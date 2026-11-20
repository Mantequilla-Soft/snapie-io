import { describe, it, expect } from 'vitest';
import { filterMutedAuthors, isMutedAuthor } from './filterMutedAuthors';

describe('filterMutedAuthors', () => {
  const items = [
    { author: 'alice', id: 1 },
    { author: 'Spammer', id: 2 },
    { author: 'bob', id: 3 },
  ];

  it('returns the same array when the mute set is empty', () => {
    const muted = new Set<string>();
    expect(filterMutedAuthors(items, muted)).toBe(items);
  });

  it('hides authors in the mute set (case-insensitive)', () => {
    const muted = new Set(['spammer']);
    expect(filterMutedAuthors(items, muted).map(i => i.id)).toEqual([1, 3]);
  });

  it('keeps exceptAuthor even when they are muted (profile feeds)', () => {
    const muted = new Set(['alice', 'spammer']);
    expect(
      filterMutedAuthors(items, muted, { exceptAuthor: 'Alice' }).map(i => i.id),
    ).toEqual([1, 3]);
  });
});

describe('isMutedAuthor', () => {
  it('matches case-insensitively', () => {
    expect(isMutedAuthor('SpamMer', new Set(['spammer']))).toBe(true);
    expect(isMutedAuthor('alice', new Set(['spammer']))).toBe(false);
  });
});
