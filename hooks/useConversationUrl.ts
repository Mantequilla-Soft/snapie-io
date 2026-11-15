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
/**
 * Which page load wrote the conversation flag. Browsers keep history.state
 * across a reload (and Next keeps custom keys on first load), so a flag left
 * by an earlier load must be ignored: after a reload the address bar's post
 * URL is the real page, not a soft-nav over the feed.
 */
export const SNAPIE_CONVERSATION_LOAD = 'snapieConversationLoad';

/**
 * One id per full page load: module state is rebuilt on reload but kept
 * across soft navigations, Back/Forward and bfcache restores.
 */
const PAGE_LOAD_ID = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

/** Next.js app/pages router bookkeeping that must not be copied into our pushes. */
const NEXT_INTERNAL_KEYS = ['__NA', '_N', '__N', '__PRIVATE_NEXTJS_INTERNALS_TREE'] as const;

/** Tests only: the id this page load stamps on its history entries. */
export function currentConversationLoadIdForTests(): string {
  return PAGE_LOAD_ID;
}

/** Enough of a comment for Conversation/Snap to remount after Forward. */
export type ConversationSnapshot = Pick<Comment, 'author' | 'permlink'> & {
  body?: string;
  created?: string;
  parent_author?: string;
  parent_permlink?: string;
  children?: number;
  json_metadata?: string;
  title?: string;
  /** Voter list so Forward shows the real count and the viewer's own vote. */
  active_votes?: Array<{ voter: string; percent?: number; rshares?: number | string }>;
  voteCount?: number;
  payout?: number;
  pending_payout_value?: string;
  total_payout_value?: string;
  curator_payout_value?: string;
  author_payout_value?: string;
  max_accepted_payout?: string;
  cashout_time?: string;
  is_paidout?: boolean;
};

export type ConversationHistoryState = {
  snapieConversation?: boolean;
  snapieConversationLoad?: string;
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
/** True only for a conversation entry written by this page load. */
export function isLiveConversationState(state: unknown): state is ConversationHistoryState {
  if (!state || typeof state !== 'object') return false;
  const s = state as ConversationHistoryState;
  return s[SNAPIE_CONVERSATION] === true && s[SNAPIE_CONVERSATION_LOAD] === PAGE_LOAD_ID;
}

export function getShellPathname(routerPathname: string): string {
  if (typeof window === 'undefined') return routerPathname;
  const state = window.history.state as ConversationHistoryState | null;
  if (isLiveConversationState(state) && typeof state[SNAPIE_SHELL_PATH] === 'string') {
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

const SNAPSHOT_MAX_VOTES = 5000;

function votesOf(comment: Comment): ConversationSnapshot['active_votes'] {
  const votes = (comment as { active_votes?: unknown }).active_votes;
  if (!Array.isArray(votes) || votes.length > SNAPSHOT_MAX_VOTES) return undefined;
  return votes
    .filter((v): v is { voter: string; percent?: number; rshares?: number | string } =>
      !!v && typeof v === 'object' && typeof (v as { voter?: unknown }).voter === 'string')
    .map(({ voter, percent, rshares }) => ({ voter, percent, rshares }));
}

function snapshotOf(comment: Comment): ConversationSnapshot {
  const c = comment as Comment & Partial<ConversationSnapshot>;
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
    active_votes: votesOf(comment),
    voteCount: typeof c.voteCount === 'number' ? c.voteCount : undefined,
    payout: typeof c.payout === 'number' ? c.payout : undefined,
    pending_payout_value: asString(c.pending_payout_value),
    total_payout_value: asString(c.total_payout_value),
    curator_payout_value: asString(c.curator_payout_value),
    author_payout_value: asString(c.author_payout_value),
    max_accepted_payout: asString(c.max_accepted_payout),
    cashout_time: asString(c.cashout_time),
    is_paidout: typeof c.is_paidout === 'boolean' ? c.is_paidout : undefined,
  };
}

function asString(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  // dhive Asset objects stringify to "1.234 HBD".
  if (value && typeof value === 'object' && typeof (value as { toString?: unknown }).toString === 'function') {
    const text = String(value);
    return text === '[object Object]' ? undefined : text;
  }
  return undefined;
}

function readState(): ConversationHistoryState {
  const current = window.history.state;
  if (current && typeof current === 'object') {
    return { ...(current as ConversationHistoryState) };
  }
  return {};
}

/**
 * Current state without Next's router keys. Next's patched pushState skips
 * its URL sync when `__NA` is present, so copying it would leave the router
 * on the old URL (a later router.refresh would reset the address bar). Next
 * re-adds its own keys after it syncs.
 */
function stateWithoutNextInternals(state: ConversationHistoryState): ConversationHistoryState {
  const out = { ...state };
  for (const key of NEXT_INTERNAL_KEYS) delete out[key];
  return out;
}

/** Same entry with our conversation keys removed. */
function stateWithoutConversation(state: ConversationHistoryState): ConversationHistoryState {
  const out = stateWithoutNextInternals(state);
  delete out[SNAPIE_CONVERSATION];
  delete out[SNAPIE_CONVERSATION_LOAD];
  delete out[SNAPIE_SHELL_PATH];
  delete out[SNAPIE_CONVERSATION_SNAPSHOT];
  return out;
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
  // Whether a conversation was open on the previous run. Closing from the UI
  // is open -> closed; a closed first run on our entry is a remount. (Not a
  // "mounted" flag: StrictMode re-runs effects without a state change.)
  const prevConversationRef = useRef<Comment | undefined>(undefined);

  useEffect(() => {
    const state = window.history.state as ConversationHistoryState | null;
    if (!isLiveConversationState(state)) {
      shellPathRef.current = pathname;
    }
  }, [pathname]);

  useEffect(() => {
    if (isEmbedMode()) return;
    const wasOpen = prevConversationRef.current !== undefined;
    prevConversationRef.current = conversation;
    if (skipSyncRef.current) {
      skipSyncRef.current = false;
      return;
    }

    const state = readState();
    const live = isLiveConversationState(state);

    if (!conversation) {
      if (!live) return;
      if (!wasOpen) {
        // The feed/profile remounted on our entry (e.g. Back from a page
        // opened inside the conversation). Going back again would skip the
        // conversation, so reopen it from the snapshot instead, or drop our
        // keys and show the shell path if there is no usable snapshot.
        const snap = state[SNAPIE_CONVERSATION_SNAPSHOT];
        if (snap?.author && snap?.permlink) {
          setConversationRef.current(snap as Comment);
        } else {
          const shellPath = typeof state[SNAPIE_SHELL_PATH] === 'string' ? state[SNAPIE_SHELL_PATH] : shellPathRef.current;
          window.history.replaceState(stateWithoutConversation(state), '', shellPath);
        }
        return;
      }
      // Closed from UI — pop our soft-nav entry so the prior URL returns
      // (and Forward can reopen). popstate is a no-op when already cleared.
      window.history.back();
      return;
    }

    const url = conversationCanonicalPath(conversation.author, conversation.permlink);
    if (
      live
      && sameSnap(state[SNAPIE_CONVERSATION_SNAPSHOT], conversation)
      && window.location.pathname === url
    ) {
      return;
    }

    const shellPath =
      live && typeof state[SNAPIE_SHELL_PATH] === 'string'
        ? state[SNAPIE_SHELL_PATH]
        : shellPathRef.current;

    const next: ConversationHistoryState = {
      // A stale entry from an earlier load is treated like a plain entry.
      ...(live ? stateWithoutNextInternals(state) : stateWithoutConversation(state)),
      snapieInApp: true,
      [SNAPIE_CONVERSATION]: true,
      [SNAPIE_CONVERSATION_LOAD]: PAGE_LOAD_ID,
      [SNAPIE_SHELL_PATH]: shellPath,
      [SNAPIE_CONVERSATION_SNAPSHOT]: snapshotOf(conversation),
    };

    if (live) {
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
      const snap = isLiveConversationState(state)
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
