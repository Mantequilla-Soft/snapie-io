import { useEffect, useRef, useState } from 'react';
import {
  heavyFeedMediaUrls,
  selectFirstScreenLcpImageSync,
} from '@/lib/images/feedLcp';

export interface HomeFeedLcp {
  /** Photo that should receive next/image `priority`. Null until a choice exists. */
  priorityUrl: string | null;
  /** GIF, video, and (once probed) oversized URLs. */
  deferUrls: readonly string[];
}

const IDLE: HomeFeedLcp = { priorityUrl: null, deferUrls: [] };

interface ProbeState {
  key: string;
  priorityUrl: string | null;
  deferUrls: string[];
}

/**
 * Home-feed LCP choice.
 *
 * GIF and video are deferred immediately from the URL. Priority waits for
 * `/api/feed-lcp` so an oversized photo is not marked fetchpriority=high.
 * If that request fails, the extension-only pick is used and the byte cap
 * is skipped — a known photo still paints.
 */
export function useHomeFeedLcp(bodies: Array<string | null | undefined> | null): HomeFeedLcp {
  const key = bodies ? bodies.map((body) => body ?? '').join('\n\0') : '';
  const bodiesRef = useRef(bodies);
  bodiesRef.current = bodies;
  const [probed, setProbed] = useState<ProbeState | null>(null);

  useEffect(() => {
    const snapshot = bodiesRef.current;
    if (!snapshot || snapshot.length === 0 || !key) return;

    const requestKey = key;
    let cancelled = false;
    const controller = new AbortController();

    fetch('/api/feed-lcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bodies: snapshot }),
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`feed-lcp ${response.status}`);
        return response.json() as Promise<{ rawUrl?: unknown; deferUrls?: unknown }>;
      })
      .then((data) => {
        if (cancelled) return;
        const rawUrl = typeof data.rawUrl === 'string' ? data.rawUrl : null;
        const deferUrls = Array.isArray(data.deferUrls)
          ? data.deferUrls.filter((url): url is string => typeof url === 'string')
          : heavyFeedMediaUrls(snapshot);
        setProbed({ key: requestKey, priorityUrl: rawUrl, deferUrls });
      })
      .catch(() => {
        if (cancelled) return;
        setProbed({
          key: requestKey,
          priorityUrl: selectFirstScreenLcpImageSync(snapshot)?.rawUrl ?? null,
          deferUrls: heavyFeedMediaUrls(snapshot),
        });
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [key]);

  if (!bodies || bodies.length === 0) return IDLE;
  if (!probed || probed.key !== key) {
    return { priorityUrl: null, deferUrls: heavyFeedMediaUrls(bodies) };
  }
  return { priorityUrl: probed.priorityUrl, deferUrls: probed.deferUrls };
}
