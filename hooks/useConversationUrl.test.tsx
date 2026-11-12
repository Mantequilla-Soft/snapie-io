// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useState } from 'react';
import type { Comment } from '@hiveio/dhive';
import {
  useConversationUrl,
  conversationCanonicalPath,
  getShellPathname,
  SNAPIE_CONVERSATION,
  SNAPIE_SHELL_PATH,
} from './useConversationUrl';

const nav = vi.hoisted(() => ({ pathname: '/' }));

vi.mock('next/navigation', () => ({
  usePathname: () => nav.pathname,
}));

function comment(author: string, permlink: string): Comment {
  return {
    author,
    permlink,
    body: `body of ${permlink}`,
    created: '2026-11-01T00:00:00',
    parent_author: 'peak.snaps',
    parent_permlink: 'snaps',
    children: 0,
    json_metadata: '{}',
    title: '',
  } as unknown as Comment;
}

function useHarness(initial?: Comment) {
  const [conversation, setConversation] = useState<Comment | undefined>(initial);
  useConversationUrl(conversation, setConversation);
  return { conversation, setConversation };
}

/** jsdom applies history.back() asynchronously (popstate on a later task). */
function waitForPopState(): Promise<void> {
  return new Promise(resolve => {
    window.addEventListener('popstate', () => resolve(), { once: true });
  });
}

beforeEach(() => {
  nav.pathname = '/';
  window.history.replaceState({}, '', '/');
});

afterEach(() => {
  window.history.replaceState({}, '', '/');
});

describe('useConversationUrl', () => {
  it('updates the address bar to /@author/permlink when a conversation opens', () => {
    const { result } = renderHook(() => useHarness());
    const snap = comment('alice', 'snap-one');

    act(() => {
      result.current.setConversation(snap);
    });

    expect(window.location.pathname).toBe('/@alice/snap-one');
    expect(conversationCanonicalPath('alice', 'snap-one')).toBe('/@alice/snap-one');
    const state = window.history.state as Record<string, unknown>;
    expect(state[SNAPIE_CONVERSATION]).toBe(true);
    expect(state[SNAPIE_SHELL_PATH]).toBe('/');
    expect(getShellPathname('/@alice/snap-one')).toBe('/');
  });

  it('restores the previous URL when the conversation closes', async () => {
    const { result } = renderHook(() => useHarness());

    act(() => {
      result.current.setConversation(comment('bob', 'snap-two'));
    });
    expect(window.location.pathname).toBe('/@bob/snap-two');

    const popped = waitForPopState();
    act(() => {
      result.current.setConversation(undefined);
    });
    await act(async () => {
      await popped;
    });

    expect(window.location.pathname).toBe('/');
    expect(result.current.conversation).toBeUndefined();
  });

  it('closes the conversation on popstate (browser Back)', async () => {
    const { result } = renderHook(() => useHarness());

    act(() => {
      result.current.setConversation(comment('carol', 'snap-three'));
    });
    expect(result.current.conversation?.permlink).toBe('snap-three');

    const popped = waitForPopState();
    act(() => {
      window.history.back();
    });
    await act(async () => {
      await popped;
    });

    expect(result.current.conversation).toBeUndefined();
    expect(window.location.pathname).toBe('/');
  });

  it('replaces history for a nested conversation so one Back returns to the feed', async () => {
    const { result } = renderHook(() => useHarness());

    act(() => {
      result.current.setConversation(comment('dave', 'parent-snap'));
    });
    act(() => {
      result.current.setConversation(comment('erin', 'nested-reply'));
    });

    expect(window.location.pathname).toBe('/@erin/nested-reply');

    const popped = waitForPopState();
    act(() => {
      window.history.back();
    });
    await act(async () => {
      await popped;
    });

    expect(window.location.pathname).toBe('/');
    expect(result.current.conversation).toBeUndefined();
  });

  it('does not change the URL in embed mode', () => {
    window.history.replaceState({}, '', '/?embed=true');
    nav.pathname = '/';
    const { result } = renderHook(() => useHarness());

    act(() => {
      result.current.setConversation(comment('frank', 'embed-snap'));
    });

    expect(window.location.pathname).toBe('/');
    expect(window.location.search).toBe('?embed=true');
  });
});
