'use client';
import { useState, useCallback, useRef } from 'react';
import { ShortItem } from '@/lib/shorts/types';

const CHECKER_URL = process.env.NEXT_PUBLIC_CHECKER_URL || 'https://3speak-checker.okinoko.io';
const SHORTS_API = `${CHECKER_URL}/shortssorted`;

let seed = Math.floor(Math.random() * 1_000_000);

function parseEmbedUrl(embedUrl: string): { author: string; permlink: string } {
  const cleaned = (embedUrl || '').replace(/^@/, '');
  const slashIdx = cleaned.indexOf('/');
  if (slashIdx === -1) return { author: cleaned, permlink: '' };
  return { author: cleaned.slice(0, slashIdx), permlink: cleaned.slice(slashIdx + 1) };
}

function timeAgo(dateStr: string): string {
  const date = new Date(dateStr);
  if (!dateStr || !isFinite(date.getTime())) return '';
  const diff = Date.now() - date.getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return 'Just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

async function fetchPage(page: number, limit: number): Promise<{ shorts: ShortItem[]; hasMore: boolean }> {
  const url = `${SHORTS_API}?page=${page}&limit=${limit}&seed=${seed}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Shorts API error: ${res.status}`);
  const data = await res.json();

  const shorts: ShortItem[] = (data.shorts || []).map((s: any) => {
    const { author, permlink: hivePermlink } = parseEmbedUrl(s.embed_url || '');
    const finalAuthor = author || s.owner || '';
    return {
      id: `${finalAuthor}-${s.permlink}-${s.createdAt}`,
      author: finalAuthor,
      hivePermlink,
      permlink: s.permlink,
      thumbnailUrl: s.thumbnail_url || '',
      title: s.hive_title || s.embed_title || '',
      views: s.views || 0,
      timeAgo: timeAgo(s.createdAt || ''),
      stats: {
        likes: s.hive_votes || 0,
        comments: s.hive_comments || 0,
        payout: s.hive_reward != null ? String(s.hive_reward) : '0.00',
      },
    };
  });

  return { shorts, hasMore: (data.page ?? 1) < (data.totalPages ?? 1) };
}

export function useShorts() {
  const [shorts, setShorts] = useState<ShortItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const pageRef = useRef(1);
  const inflightRef = useRef(false);
  const failedPageRef = useRef<number | null>(null);

  const load = useCallback(async (reset = false) => {
    if (inflightRef.current) return;
    // Skip a page that already failed to prevent a hot retry loop
    if (!reset && failedPageRef.current === pageRef.current) return;
    inflightRef.current = true;

    if (reset) {
      seed = Math.floor(Math.random() * 1_000_000);
      pageRef.current = 1;
      failedPageRef.current = null;
      setShorts([]);
      setHasMore(true);
    }

    setLoading(true);
    setError(null);
    try {
      const { shorts: newShorts, hasMore: more } = await fetchPage(pageRef.current, 10);
      failedPageRef.current = null;
      setShorts(prev => (reset ? newShorts : [...prev, ...newShorts]));
      setHasMore(more);
      pageRef.current += 1;
    } catch (e: any) {
      failedPageRef.current = pageRef.current;
      setError(e.message || 'Failed to load shorts');
    } finally {
      setLoading(false);
      inflightRef.current = false;
    }
  }, []);

  return { shorts, loading, error, hasMore, load };
}
