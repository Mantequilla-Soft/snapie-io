'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { mutedAccountsManager } from '@/lib/hive/muted-accounts';
import { filterMutedAuthors, isMutedAuthor } from '@/lib/hive/filterMutedAuthors';
import { useOptionalHiveUser } from '@/contexts/UserContext';

/**
 * Combined muted set (community + this viewer's personal list) for client
 * feeds. Reuses mutedAccountsManager's 24h / pending-mute cache — one list
 * load, not a call per item. Also listens for notifyPersonalMute so a mute
 * that just succeeded hides that author without waiting for a refetch.
 *
 * Server-pooled discovery routes only bake community mutes into the shared
 * cache; pass the same `viewer` here so personal mutes apply on the client.
 *
 * Falls back to the persisted Hive account (the source snap comments use)
 * when the wallet session has not restored yet, so feeds and comments agree
 * on whose mute list applies.
 */
export function usePersonalMuteFilter(viewer?: string | null) {
  const persistedUser = useOptionalHiveUser();
  const effectiveViewer = viewer || persistedUser?.name || undefined;
  const [mutedSet, setMutedSet] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    let cancelled = false;
    mutedAccountsManager.getMutedList(effectiveViewer).then((list) => {
      if (!cancelled) setMutedSet(list);
    }).catch(() => {
      // Keep the previous set; a failed load must not unhide anyone.
    });
    return () => {
      cancelled = true;
    };
  }, [effectiveViewer]);

  useEffect(() => {
    return mutedAccountsManager.subscribePersonalMute((author) => {
      setMutedSet((prev) => {
        if (prev.has(author)) return prev;
        const next = new Set(prev);
        next.add(author);
        return next;
      });
    });
  }, []);

  const isMuted = useCallback((author: string) => isMutedAuthor(author, mutedSet), [mutedSet]);
  const filterMuted = useCallback(
    <T extends { author: string }>(items: readonly T[], options?: { exceptAuthor?: string }) =>
      filterMutedAuthors(items, mutedSet, options),
    [mutedSet],
  );

  return useMemo(
    () => ({ mutedSet, isMutedAuthor: isMuted, filterMuted }),
    [mutedSet, isMuted, filterMuted],
  );
}
