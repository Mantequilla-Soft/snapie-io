'use client';
import { useCallback, useRef, useState } from 'react';
import { getActiveMentionDraft, type ActiveMentionDraft } from '@/lib/chat/mentions';
import { searchUsernamesByPrefix } from '@/lib/hive/usernameLookup';

const DEBOUNCE_MS = 300;
const MAX_SUGGESTIONS = 6;

export interface MentionInsertResult {
  text: string;
  cursorPos: number;
}

interface MentionAutocompleteState {
  suggestions: string[];
  activeIndex: number;
  isOpen: boolean;
}

const EMPTY_STATE: MentionAutocompleteState = { suggestions: [], activeIndex: 0, isOpen: false };

/**
 *  Drives a live "@partial -> matching usernames" dropdown for a plain
 *  textarea. Pure state/logic — no DOM, no rendering — so it plugs into any
 *  composer (blog, snap) the same way. See MentionHighlightedTextarea for
 *  the piece that actually renders this.
 *
 *  Cost control: a fresh RPC only fires 300ms after the last keystroke, only
 *  once the partial is 3+ characters (Hive's own minimum username length —
 *  nothing shorter could ever resolve), and searchUsernamesByPrefix itself
 *  caches by prefix, so re-typing through an already-seen prefix is free.
 */
export function useMentionAutocomplete() {
  const [state, setState] = useState<MentionAutocompleteState>(EMPTY_STATE);
  const draftRef = useRef<ActiveMentionDraft | null>(null);
  const requestIdRef = useRef(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const close = useCallback(() => {
    draftRef.current = null;
    requestIdRef.current += 1; // invalidate any in-flight response
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setState(EMPTY_STATE);
  }, []);

  /** Call with the full text + caret position on every change. */
  const handleTextChange = useCallback((text: string, cursorPos: number) => {
    const draft = getActiveMentionDraft(text, cursorPos);
    draftRef.current = draft;
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!draft || draft.query.length < 3) {
      setState(EMPTY_STATE);
      return;
    }

    const { query } = draft;
    const requestId = ++requestIdRef.current;
    debounceRef.current = setTimeout(async () => {
      const results = await searchUsernamesByPrefix(query, MAX_SUGGESTIONS);
      // Stale response (user kept typing, or closed the dropdown) — drop it.
      if (requestId !== requestIdRef.current) return;
      if (!draftRef.current || draftRef.current.query !== query) return;
      setState({ suggestions: results, activeIndex: 0, isOpen: results.length > 0 });
    }, DEBOUNCE_MS);
  }, []);

  /** Splices `name` into `text` at the active draft's range. Returns null if
   *  there's nothing active to apply it to — caller applies the result
   *  however it manages its own text (React state or a direct DOM write). */
  const applySuggestion = useCallback((text: string, name: string): MentionInsertResult | null => {
    const draft = draftRef.current;
    if (!draft) return null;
    const before = text.slice(0, draft.start);
    const after = text.slice(draft.end);
    const inserted = `@${name} `;
    close();
    return { text: before + inserted + after, cursorPos: before.length + inserted.length };
  }, [close]);

  /** Call from onKeyDown with the key name and the textarea's current value.
   *  `handled: true` means the caller should preventDefault(); `result`
   *  (only set for Enter/Tab) is what to commit. */
  const handleKeyDown = useCallback((
    key: string,
    text: string
  ): { handled: boolean; result?: MentionInsertResult } => {
    if (!state.isOpen) return { handled: false };

    if (key === 'ArrowDown') {
      setState(s => ({ ...s, activeIndex: (s.activeIndex + 1) % s.suggestions.length }));
      return { handled: true };
    }
    if (key === 'ArrowUp') {
      setState(s => ({ ...s, activeIndex: (s.activeIndex - 1 + s.suggestions.length) % s.suggestions.length }));
      return { handled: true };
    }
    if (key === 'Escape') {
      close();
      return { handled: true };
    }
    if (key === 'Enter' || key === 'Tab') {
      const name = state.suggestions[state.activeIndex];
      if (!name) return { handled: false };
      const result = applySuggestion(text, name) ?? undefined;
      return { handled: true, result };
    }
    return { handled: false };
  }, [state, applySuggestion, close]);

  return {
    suggestions: state.suggestions,
    activeIndex: state.activeIndex,
    isOpen: state.isOpen,
    setActiveIndex: (i: number) => setState(s => ({ ...s, activeIndex: i })),
    handleTextChange,
    handleKeyDown,
    applySuggestion,
    close,
  };
}
