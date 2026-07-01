'use client';
import { useCallback, useEffect, useRef, useState } from 'react';

const POLL_INTERVAL_MS = 30_000;

interface NewSnapsResponse {
  count: number;
  latestTimestamp: string | null;
  serverTime: string;
  warming: boolean;
}

const SOURCE_ENDPOINT: Record<'snaps' | 'blended', string> = {
  snaps: '/api/new-snaps',
  blended: '/api/feed/new-since',
};

interface UseNewSnapsAvailableProps {
  /** 'snaps' (default) counts against peak.snaps only, matching the "For You"/
   *  legacy behavior. 'blended' counts against the merged snap+wave index that
   *  backs "Latest" when the blended feed is active — pass
   *  `showBlendedForAll` from app/page.tsx so this always matches whatever
   *  "Latest" is actually showing right now. */
  source?: 'snaps' | 'blended';
}

/**
 * Polls the activity sidecar for posts made since a cursor that only advances
 * when the caller acknowledges them — so the count accumulates the longer the
 * banner is ignored, same as Twitter's "N new posts" prompt.
 */
export function useNewSnapsAvailable({ source = 'snaps' }: UseNewSnapsAvailableProps = {}) {
  const [newCount, setNewCount] = useState(0);
  const baselineSinceRef = useRef<number>(Date.now());
  const lastServerTimeRef = useRef<number>(Date.now());

  useEffect(() => {
    let cancelled = false;
    const endpoint = SOURCE_ENDPOINT[source];

    async function poll() {
      try {
        const res = await fetch(`${endpoint}?since=${baselineSinceRef.current}`);
        if (!res.ok) return;
        const data: NewSnapsResponse = await res.json();
        if (cancelled) return;
        if (data.serverTime) lastServerTimeRef.current = Date.parse(data.serverTime);
        if (!data.warming) setNewCount(data.count ?? 0);
      } catch {
        // silently ignore — banner just stays hidden until the next tick
      }
    }

    poll();
    const id = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [source]);

  // Advance the cursor to the last known SERVER clock (not the browser's —
  // avoids client/server drift) and zero the count. Call this when the user
  // actually views the new snaps, not on every poll.
  const acknowledge = useCallback(() => {
    baselineSinceRef.current = lastServerTimeRef.current;
    setNewCount(0);
  }, []);

  return { newCount, acknowledge };
}
