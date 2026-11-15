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
  SNAPIE_CONVERSATION_LOAD,
  SNAPIE_CONVERSATION_SNAPSHOT,
  SNAPIE_SHELL_PATH,
  currentConversationLoadIdForTests,
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

  it('ignores a conversation flag left by an earlier page load (reload on the post URL)', () => {
    // What the browser restores after: open a snap on /, then reload at /@alice/x.
    window.history.replaceState({
      __NA: true,
      [SNAPIE_CONVERSATION]: true,
      [SNAPIE_CONVERSATION_LOAD]: 'an-earlier-load',
      [SNAPIE_SHELL_PATH]: '/',
      [SNAPIE_CONVERSATION_SNAPSHOT]: { author: 'alice', permlink: 'x' },
    }, '', '/@alice/x');
    nav.pathname = '/@alice/x';

    // Chrome (BottomTabBar, Sidebar, LayoutContent) sees the real page.
    expect(getShellPathname('/@alice/x')).toBe('/@alice/x');

    // A feed mounting on that entry neither goes back nor reopens the stale snap.
    const back = vi.spyOn(window.history, 'back');
    const { result } = renderHook(() => useHarness());
    expect(back).not.toHaveBeenCalled();
    expect(result.current.conversation).toBeUndefined();
    expect(window.location.pathname).toBe('/@alice/x');

    // Opening a conversation from here pushes a fresh entry stamped with this load.
    const push = vi.spyOn(window.history, 'pushState');
    const replace = vi.spyOn(window.history, 'replaceState');
    act(() => {
      result.current.setConversation(comment('bob', 'y'));
    });
    expect(push).toHaveBeenCalledTimes(1);
    expect(replace).not.toHaveBeenCalled();
    push.mockRestore();
    replace.mockRestore();
    const state = window.history.state as Record<string, unknown>;
    expect(state[SNAPIE_CONVERSATION_LOAD]).toBe(currentConversationLoadIdForTests());
    expect(state[SNAPIE_SHELL_PATH]).toBe('/@alice/x');
    back.mockRestore();
  });

  it('reopens from the snapshot when the feed remounts on our entry, instead of going back', () => {
    const first = renderHook(() => useHarness());
    act(() => {
      first.result.current.setConversation(comment('carol', 'z'));
    });
    expect(window.location.pathname).toBe('/@carol/z');
    // e.g. a Next link inside the conversation unmounted the feed, then Back
    // restored this entry and the feed mounts again.
    first.unmount();

    const back = vi.spyOn(window.history, 'back');
    const second = renderHook(() => useHarness());
    expect(back).not.toHaveBeenCalled();
    expect(second.result.current.conversation?.author).toBe('carol');
    expect(second.result.current.conversation?.permlink).toBe('z');
    expect(window.location.pathname).toBe('/@carol/z');
    back.mockRestore();
  });

  it('does not copy Next router keys into the pushed state', () => {
    window.history.replaceState({ __NA: true, __PRIVATE_NEXTJS_INTERNALS_TREE: ['', {}], keep: 1 }, '', '/');
    const { result } = renderHook(() => useHarness());
    act(() => {
      result.current.setConversation(comment('dave', 'w'));
    });
    const state = window.history.state as Record<string, unknown>;
    expect(state.__NA).toBeUndefined();
    expect(state.__PRIVATE_NEXTJS_INTERNALS_TREE).toBeUndefined();
    expect(state.keep).toBe(1);
    expect(state[SNAPIE_CONVERSATION]).toBe(true);
  });

  it('keeps votes and payout in the snapshot so Forward shows the real vote state', () => {
    const { result } = renderHook(() => useHarness());
    const snap = {
      ...comment('erin', 'v'),
      active_votes: [{ voter: 'frank', percent: 10000, rshares: 123, weight: 9, time: 't' }],
      pending_payout_value: '1.234 HBD',
      payout: 1.234,
    } as unknown as Comment;
    act(() => {
      result.current.setConversation(snap);
    });
    const saved = (window.history.state as Record<string, unknown>)[SNAPIE_CONVERSATION_SNAPSHOT] as Record<string, unknown>;
    expect(saved.active_votes).toEqual([{ voter: 'frank', percent: 10000, rshares: 123 }]);
    expect(saved.pending_payout_value).toBe('1.234 HBD');
    expect(saved.payout).toBe(1.234);
  });
});
