'use client';
import { useEffect, useRef, useState } from 'react';
import { extractMentions } from '@/lib/chat/mentions';
import { validateUsernames, getKnownValidity } from '@/lib/hive/usernameLookup';

const DEBOUNCE_MS = 500;

/**
 *  Which @mentions currently in `text` are confirmed-real Hive accounts —
 *  true once verified, false once confirmed nonexistent, absent while still
 *  unresolved. Drives the "turn blue" signal in MentionHighlightedTextarea.
 *
 *  Cost control: one batched get_accounts call per debounced pause in typing,
 *  covering only mentions not already resolved by a prior pass or by having
 *  been picked from the autocomplete dropdown (usernameLookup's cache is
 *  shared with that path, so picking a suggestion never costs a second call).
 */
export function useMentionValidation(text: string): Map<string, boolean> {
  const [validity, setValidity] = useState<Map<string, boolean>>(new Map());
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const mentions = extractMentions(text);
    if (mentions.length === 0) {
      setValidity(new Map());
      return;
    }

    // Seed synchronously from whatever's already known so color doesn't lag
    // a full debounce behind for names already resolved.
    setValidity(prev => {
      const next = new Map<string, boolean>();
      for (const name of mentions) {
        const known = getKnownValidity(name);
        if (known !== null) next.set(name, known);
        else if (prev.has(name)) next.set(name, prev.get(name)!);
      }
      return next;
    });

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      const validNames = await validateUsernames(mentions);
      setValidity(new Map(mentions.map(name => [name, validNames.has(name)])));
    }, DEBOUNCE_MS);

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [text]);

  return validity;
}
