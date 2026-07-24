import { describe, it, expect, beforeEach, afterEach } from 'vitest';

describe('isAdminUsername', () => {
  const original = process.env.ADMIN_HIVE_USERNAMES;

  afterEach(() => {
    process.env.ADMIN_HIVE_USERNAMES = original;
  });

  it('returns false when the allowlist is unset', async () => {
    delete process.env.ADMIN_HIVE_USERNAMES;
    const { isAdminUsername } = await import('./admin');
    expect(isAdminUsername('meno')).toBe(false);
  });

  it('matches a username in a comma-separated allowlist, case-insensitively', async () => {
    process.env.ADMIN_HIVE_USERNAMES = 'meno, someone-else';
    const { isAdminUsername } = await import('./admin');
    expect(isAdminUsername('Meno')).toBe(true);
    expect(isAdminUsername('someone-else')).toBe(true);
    expect(isAdminUsername('rando')).toBe(false);
  });
});
