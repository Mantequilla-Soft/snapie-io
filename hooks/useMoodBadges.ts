'use client';
import { useEffect, useState } from 'react';
import { MoodBadgeSku, isMoodBadgeSku } from '@/lib/moodBadges/constants';
import { hasViewerSessionMarker, VIEWER_SESSION_EVENT } from '@/lib/auth/viewerSession';

// Same shape as usePatronStatus.ts — a mood badge renders next to an avatar
// wherever one appears, many components, no single shared ancestor worth
// prop-drilling through. Module-level cache so N simultaneously-mounted
// avatars share one fetch instead of each firing their own.
const CACHE_DURATION_MS = 120_000; // matches the route's Cache-Control max-age
let cache: Map<string, MoodBadgeSku> | null = null;
let cacheTimestamp = 0;
let inFlight: Promise<Map<string, MoodBadgeSku>> | null = null;

async function fetchEquipped(): Promise<Map<string, MoodBadgeSku>> {
  if (cache && Date.now() - cacheTimestamp < CACHE_DURATION_MS) return cache;
  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      const res = await fetch('/api/mood-badges/equipped');
      const data: Record<string, string> = res.ok ? await res.json() : {};
      cache = new Map(Object.entries(data).filter((entry): entry is [string, MoodBadgeSku] => isMoodBadgeSku(entry[1])));
      cacheTimestamp = Date.now();
      return cache;
    } catch {
      cache = new Map();
      cacheTimestamp = Date.now();
      return cache;
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}

const MOOD_BADGE_CHANGED_EVENT = 'snapie:mood-badge-changed';

/** Test-only. The module cache would otherwise leak across cases. */
export function resetMoodBadgeCacheForTests(): void {
  cache = null;
  cacheTimestamp = 0;
  inFlight = null;
}

export function useMoodBadges() {
  const [byAccount, setByAccount] = useState<Map<string, MoodBadgeSku>>(cache ?? new Map());
  const [isLoading, setIsLoading] = useState(!cache);

  useEffect(() => {
    let cancelled = false;

    // Equipped badges are public, but the route needs Mongo. A logged-out
    // visit has no session marker, so skip the request instead of logging a
    // 500. A later login (VIEWER_SESSION_EVENT / hiveuser-saved) fetches.
    const load = () => {
      if (!hasViewerSessionMarker()) {
        if (!cancelled) setIsLoading(false);
        return;
      }
      fetchEquipped().then(map => {
        if (!cancelled) {
          setByAccount(map);
          setIsLoading(false);
        }
      });
    };
    load();

    // Refetch every mounted consumer immediately after this device's own
    // equip/buy, instead of each one waiting up to CACHE_DURATION_MS for the
    // module cache to naturally expire — same shape as POINTS_EARNED_EVENT
    // refreshing usePointsSummary.
    const onChanged = () => {
      cache = null;
      cacheTimestamp = 0;
      load();
    };
    window.addEventListener(MOOD_BADGE_CHANGED_EVENT, onChanged);
    window.addEventListener(VIEWER_SESSION_EVENT, load);
    window.addEventListener('hiveuser-saved', load);

    return () => {
      cancelled = true;
      window.removeEventListener(MOOD_BADGE_CHANGED_EVENT, onChanged);
      window.removeEventListener(VIEWER_SESSION_EVENT, load);
      window.removeEventListener('hiveuser-saved', load);
    };
  }, []);

  const getEquippedBadge = (account: string): MoodBadgeSku | null => byAccount.get(account) ?? null;

  return { byAccount, getEquippedBadge, isLoading };
}

/** Call after a successful buy/equip so every already-mounted avatar picks
 *  up the change immediately. */
export function notifyMoodBadgeChanged(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(MOOD_BADGE_CHANGED_EVENT));
}
