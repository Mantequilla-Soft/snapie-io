// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useHiveNotifications } from './useHiveNotifications';

// bridge.account_notifications was never cross-checked against the muted
// list — a muted/blacklisted account could still show up in the bell/list.
// These tests cover the fix: notifications are filtered the same way every
// other content surface is, keyed off `msg`'s leading "@actor" (there's no
// separate author field on a Hive notification).

function notification(id: number, actor: string, type = 'vote') {
  return { id, type, score: 1, date: '2026-08-20T00:00:00', msg: `@${actor} upvoted your post`, url: `@${actor}/post-${id}` };
}

const callMock = vi.fn(async (_api: string, method: string, _params?: unknown) => {
  if (method === 'account_notifications') {
    return [notification(3, 'goodauthor'), notification(2, 'spammer'), notification(1, 'goodauthor')];
  }
  if (method === 'unread_notifications') {
    return { lastread: '1970-01-01T00:00:00', unread: 0 };
  }
  return [];
});

vi.mock('@/lib/hive/hiveclient', () => ({
  default: { call: (...args: [string, string, unknown]) => callMock(...args) },
}));

vi.mock('@/lib/hive/aioha', () => ({
  customJsonWithAioha: vi.fn(async () => ({ success: true })),
  KeyTypes: { Posting: 'posting' },
}));

const mutedListMock = vi.fn(async (username?: string) => {
  if (username === 'meno') return new Set(['spammer']);
  return new Set<string>();
});

vi.mock('@/lib/hive/muted-accounts', () => ({
  mutedAccountsManager: { getMutedList: (username?: string) => mutedListMock(username) },
}));

beforeEach(() => {
  callMock.mockClear();
  mutedListMock.mockClear();
});

describe('useHiveNotifications mute filtering', () => {
  it('excludes notifications from an actor the viewer has muted', async () => {
    const { result } = renderHook(() => useHiveNotifications('meno', { poll: false }));

    await waitFor(() => expect(result.current.loading).toBe(false));

    const actors = result.current.notifications.map(n => n.msg.split(' ')[0]);
    expect(actors).toContain('@goodauthor');
    expect(actors).not.toContain('@spammer');
    expect(result.current.notifications).toHaveLength(2);
  });

  it('does not filter when the viewer has no mutes', async () => {
    const { result } = renderHook(() => useHiveNotifications('nomutesuser', { poll: false }));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.notifications).toHaveLength(3);
  });

  it('looks up the mute list for the viewing account, not a hardcoded user', async () => {
    renderHook(() => useHiveNotifications('meno', { poll: false }));
    await waitFor(() => expect(mutedListMock).toHaveBeenCalledWith('meno'));
  });
});
