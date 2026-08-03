import { describe, it, expect, vi, beforeEach } from 'vitest';

const call = vi.fn();
const getAccounts = vi.fn();

vi.mock('@/lib/hive/hiveclient', () => ({
  default: {
    call: (...args: unknown[]) => call(...args),
    database: { getAccounts: (...args: unknown[]) => getAccounts(...args) },
  },
}));

import { searchUsernamesByPrefix, validateUsernames, getKnownValidity } from '@/lib/hive/usernameLookup';

// searchUsernamesByPrefix's cache is module-level and intentionally persists
// across calls (that's the whole point) — so each test below uses its own
// non-overlapping prefix family. Two prefixes where one starts with the
// other share cache state on purpose (that's what the "answers a longer
// prefix locally" test exercises); anything not testing that relationship
// needs a prefix no other test's data could be mistaken for a continuation
// of.
beforeEach(() => {
  call.mockReset();
  getAccounts.mockReset();
});

describe('searchUsernamesByPrefix', () => {
  it('never queries below the 3-character minimum', async () => {
    expect(await searchUsernamesByPrefix('zq')).toEqual([]);
    expect(call).not.toHaveBeenCalled();
  });

  it('queries condenser_api.lookup_accounts for a fresh prefix', async () => {
    call.mockResolvedValue(['fooone', 'footwo']);
    const result = await searchUsernamesByPrefix('foo', 8);
    expect(result).toEqual(['fooone', 'footwo']);
    expect(call).toHaveBeenCalledWith('condenser_api', 'lookup_accounts', ['foo', 8]);
  });

  it('reuses the cached result for a prefix already queried, no second call', async () => {
    call.mockResolvedValue(['barone', 'bartwo']);
    await searchUsernamesByPrefix('bar123');
    call.mockClear();

    const result = await searchUsernamesByPrefix('bar123');
    expect(result).toEqual(['barone', 'bartwo']);
    expect(call).not.toHaveBeenCalled();
  });

  it('answers a longer prefix from a shorter one locally once that shorter result is known-complete', async () => {
    // Fewer results than the limit means the shorter prefix's set is complete.
    call.mockResolvedValue(['baz999cat']);
    await searchUsernamesByPrefix('baz999', 8);
    call.mockClear();

    const result = await searchUsernamesByPrefix('baz999cat', 8);
    expect(result).toEqual(['baz999cat']);
    expect(call).not.toHaveBeenCalled();
  });

  it('does not assume completeness when a prefix returned a full page', async () => {
    call.mockResolvedValue(['quxone', 'quxtwo']); // exactly at the limit
    await searchUsernamesByPrefix('qux555', 2);
    call.mockClear();
    call.mockResolvedValue(['quxone1']);

    const result = await searchUsernamesByPrefix('qux5551', 2);
    expect(call).toHaveBeenCalledWith('condenser_api', 'lookup_accounts', ['qux5551', 2]);
    expect(result).toEqual(['quxone1']);
  });

  it('returns an empty array instead of throwing on an RPC failure', async () => {
    call.mockRejectedValue(new Error('node unreachable'));
    expect(await searchUsernamesByPrefix('failcase')).toEqual([]);
  });
});

describe('validateUsernames', () => {
  it('checks only names not already resolved', async () => {
    call.mockResolvedValue(['knownvalid']);
    await searchUsernamesByPrefix('knownvalid'); // seeds the valid-name cache

    getAccounts.mockResolvedValue([{ name: 'freshname' }]);
    const result = await validateUsernames(['knownvalid', 'freshname', 'doesnotexist']);

    expect(getAccounts).toHaveBeenCalledWith(['freshname', 'doesnotexist']);
    expect(result).toEqual(new Set(['knownvalid', 'freshname']));
  });

  it('does not re-query a name already confirmed invalid on a prior pass', async () => {
    getAccounts.mockResolvedValue([]);
    await validateUsernames(['ghostuser']);
    getAccounts.mockClear();

    const result = await validateUsernames(['ghostuser']);
    expect(getAccounts).not.toHaveBeenCalled();
    expect(result.has('ghostuser')).toBe(false);
  });

  it('is case-insensitive and de-duplicates', async () => {
    getAccounts.mockResolvedValue([{ name: 'mixedcase' }]);
    await validateUsernames(['MixedCase', 'mixedcase']);
    expect(getAccounts).toHaveBeenCalledWith(['mixedcase']);
  });
});

describe('getKnownValidity', () => {
  it('is null for a name never looked up', () => {
    expect(getKnownValidity('nobodyaskedaboutme')).toBeNull();
  });

  it('reflects a prior validateUsernames result synchronously', async () => {
    getAccounts.mockResolvedValue([{ name: 'confirmedname' }]);
    await validateUsernames(['confirmedname']);
    expect(getKnownValidity('confirmedname')).toBe(true);
  });
});
