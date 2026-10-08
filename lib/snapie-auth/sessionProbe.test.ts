// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SnapieAuthError } from '@/lib/snapie-auth/types';
import { loadSnapieMe, resetAuthProbeForTests, shouldSkipAuthMe } from './sessionProbe';
import type { SnapieMeUser } from '@/lib/snapie-auth/types';

const user = {
  id: '1',
  name: 'Tester',
  picture: null,
  hiveUsername: 'tester',
  custodyMode: null,
  isAdmin: false,
  email: null,
  accountValueUsd: null,
  emancipationRequired: false,
} satisfies SnapieMeUser;

afterEach(() => {
  resetAuthProbeForTests();
});

describe('loadSnapieMe', () => {
  it('shares one in-flight auth/me call', async () => {
    const getMe = vi.fn(() => new Promise<SnapieMeUser>((resolve) => {
      setTimeout(() => resolve(user), 10);
    }));
    const [a, b] = await Promise.all([loadSnapieMe(getMe), loadSnapieMe(getMe)]);
    expect(a?.hiveUsername).toBe('tester');
    expect(b?.hiveUsername).toBe('tester');
    expect(getMe).toHaveBeenCalledTimes(1);
  });

  it('remembers a 401 and does not call auth/me again', async () => {
    const getMe = vi.fn(() => Promise.reject(new SnapieAuthError('Unauthorized', 401)));
    await expect(loadSnapieMe(getMe)).resolves.toBeNull();
    await expect(loadSnapieMe(getMe)).resolves.toBeNull();
    expect(getMe).toHaveBeenCalledTimes(1);
    expect(shouldSkipAuthMe()).toBe(true);
  });

  it('backs off after a 429 instead of retrying', async () => {
    const getMe = vi.fn(() => Promise.reject(new SnapieAuthError('rate_limited', 429)));
    await expect(loadSnapieMe(getMe)).resolves.toBeNull();
    await expect(loadSnapieMe(() => Promise.reject(new Error('should not run')))).resolves.toBeNull();
    expect(getMe).toHaveBeenCalledTimes(1);
    expect(shouldSkipAuthMe()).toBe(true);
  });
});
