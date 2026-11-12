'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import type { Comment } from '@hiveio/dhive';

/** Marks a history entry created for an inline Conversation soft-nav. */
export const SNAPIE_CONVERSATION = 'snapieConversation';
/** The real page path (feed/profile) while the address bar shows a post URL. */
export const SNAPIE_SHELL_PATH = 'snapieShellPath';
/** Minimal comment fields so Forward can reopen the conversation. */
export const SNAPIE_CONVERSATION_SNAPSHOT = 'snapieConversationSnapshot';

/** Enough of a comment for Conversation/Snap to remount after Forward. */
export type ConversationSnapshot = Pick<Comment, 'author' | 'permlink'> & {
  body?: string;
  created?: string;
  parent_author?: string;
  parent_permlink?: string;
  children?: number;
  json_metadata?: string;
  title?: string;
};

export type ConversationHistoryState = {
  snapieConversation?: boolean;
  snapieShellPath?: string;
  snapieConversationSnapshot?: ConversationSnapshot;
  snapieInApp?: boolean;
  [key: string]: unknown;
};

export function conversationCanonicalPath(author: string, permlink: string): string {
  return `/@${author}/${permlink}`;
}

/**
 * Path chrome should treat as current while a conversation soft-nav is active.
 * Next syncs history.pushState into usePathname; without this, Home highlighting,
 * compose-on-home, and phone chat-close would react to the post URL.
 */
export function getShellPathname(routerPathname: string): string {
  if (typeof window === 'undefined') return routerPathname;
  const state = window.history.state as ConversationHistoryState | null;
  if (state?.[SNAPIE_CONVERSATION] === true && typeof state[SNAPIE_SHELL_PATH] === 'string') {
    return state[SNAPIE_SHELL_PATH];
  }
  return routerPathname;
}

function isEmbedMode(): boolean {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('embed') === 'true';
}

function sameSnap(a: { author: string; permlink: string } | undefined, b: { author: string; permlink: string } | undefined) {
  return !!a && !!b && a.author === b.author && a.permlink === b.permlink;
}

function snapshotOf(comment: Comment): ConversationSnapshot {
  return {
    author: comment.author,
    permlink: comment.permlink,
    // Snaps are short; cap anyway so a long post can't bloat history.state.
    body: comment.body?.slice(0, 20000),
    created: comment.created,
    parent_author: comment.parent_author,
    parent_permlink: comment.parent_permlink,
    children: comment.children,
    json_metadata: comment.json_metadata,
    title: comment.title,
  };
}

function readState(): ConversationHistoryState {
  const current = window.history.state;
  if (current && typeof current === 'object') {
    return { ...(current as ConversationHistoryState) };
  }
  return {};
}

/**
 * Keeps the address bar on `/@author/permlink` while an inline Conversation is
 * open, without a Next navigation (feed/profile stay mounted, scroll preserved).
 *
 * Nested opens replace the current history entry so one Back returns to the
 * feed/profile. Close (button / Escape / filter change) pops that entry when
 * it is ours; popstate clears conversation. Forward restores from the snapshot
 * stored on the history entry.
 *
 * No-ops in embed mode (`?embed=true`).
 */
export function useConversationUrl(
  conversation: Comment | undefined,
  setConversation: (conversation: Comment | undefined) => void,
): void {
  const pathname = usePathname();
  const shellPathRef = useRef(pathname);
  const skipSyncRef = useRef(false);
  const setConversationRef = useRef(setConversation);
  setConversationRef.current = setConversation;
  const conversationRef = useRef(conversation);
  conversationRef.current = conversation;

  useEffect(() => {
    const state = window.history.state as ConversationHistoryState | null;
    if (state?.[SNAPIE_CONVERSATION] !== true) {
      shellPathRef.current = pathname;
    }
  }, [pathname]);

  useEffect(() => {
    if (isEmbedMode()) return;
    if (skipSyncRef.current) {
      skipSyncRef.current = false;
      return;
    }

    const state = readState();

    if (!conversation) {
      // Closed from UI — pop our soft-nav entry so the prior URL returns
      // (and Forward can reopen). popstate is a no-op when already cleared.
      if (state[SNAPIE_CONVERSATION] === true) {
        window.history.back();
      }
      return;
    }

    const url = conversationCanonicalPath(conversation.author, conversation.permlink);
    if (
      state[SNAPIE_CONVERSATION] === true
      && sameSnap(state[SNAPIE_CONVERSATION_SNAPSHOT], conversation)
      && window.location.pathname === url
    ) {
      return;
    }

    const shellPath =
      state[SNAPIE_CONVERSATION] === true && typeof state[SNAPIE_SHELL_PATH] === 'string'
        ? state[SNAPIE_SHELL_PATH]
        : shellPathRef.current;

    const next: ConversationHistoryState = {
      ...state,
      snapieInApp: true,
      [SNAPIE_CONVERSATION]: true,
      [SNAPIE_SHELL_PATH]: shellPath,
      [SNAPIE_CONVERSATION_SNAPSHOT]: snapshotOf(conversation),
    };

    if (state[SNAPIE_CONVERSATION] === true) {
      // Nested conversation: replace so a single Back exits to the feed.
      window.history.replaceState(next, '', url);
    } else {
      window.history.pushState(next, '', url);
    }
  }, [conversation]);

  useEffect(() => {
    if (isEmbedMode()) return;

    const onPopState = () => {
      const state = window.history.state as ConversationHistoryState | null;
      const snap = state?.[SNAPIE_CONVERSATION] === true
        ? state[SNAPIE_CONVERSATION_SNAPSHOT]
        : undefined;

      if (snap?.author && snap?.permlink) {
        if (!sameSnap(conversationRef.current, snap)) {
          skipSyncRef.current = true;
          setConversationRef.current(snap as Comment);
        }
        return;
      }

      if (conversationRef.current) {
        skipSyncRef.current = true;
        setConversationRef.current(undefined);
      }
    };

    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);
}
