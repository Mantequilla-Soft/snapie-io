'use client';
import { useEffect, useState } from 'react';
import { MoodBadgeSku, isMoodBadgeSku } from '@/lib/moodBadges/constants';

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

export function useMoodBadges() {
  const [byAccount, setByAccount] = useState<Map<string, MoodBadgeSku>>(cache ?? new Map());
  const [isLoading, setIsLoading] = useState(!cache);

  useEffect(() => {
    let cancelled = false;
    fetchEquipped().then(map => {
      if (!cancelled) {
        setByAccount(map);
        setIsLoading(false);
      }
    });

    // Refetch every mounted consumer immediately after this device's own
    // equip/buy, instead of each one waiting up to CACHE_DURATION_MS for the
    // module cache to naturally expire — same shape as POINTS_EARNED_EVENT
    // refreshing usePointsSummary.
    const onChanged = () => {
      cache = null;
      cacheTimestamp = 0;
      fetchEquipped().then(map => { if (!cancelled) setByAccount(map); });
    };
    window.addEventListener(MOOD_BADGE_CHANGED_EVENT, onChanged);

    return () => {
      cancelled = true;
      window.removeEventListener(MOOD_BADGE_CHANGED_EVENT, onChanged);
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
