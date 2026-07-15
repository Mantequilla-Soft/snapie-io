'use client';
import { useCallback, useEffect, useState } from 'react';
import { POINTS_EARNED_EVENT, PointsEarnedDetail } from '@/lib/points/client';

export interface PointsSummary {
  balance: number;
  lifetimeEarned: number;
}

/** Fetches a user's points summary and keeps it live: refetches on username
 *  change and optimistically bumps the balance when THIS device earns (the
 *  POINTS_EARNED_EVENT carries the fresh balance, so we don't even need to
 *  refetch). Returns null until first load. */
export function usePointsSummary(username: string | null | undefined): PointsSummary | null {
  const [summary, setSummary] = useState<PointsSummary | null>(null);

  const refetch = useCallback(async () => {
    if (!username) {
      setSummary(null);
      return;
    }
    try {
      const res = await fetch(`/api/points/summary?username=${encodeURIComponent(username)}`);
      if (!res.ok) return;
      const data = (await res.json()) as PointsSummary;
      setSummary({ balance: data.balance ?? 0, lifetimeEarned: data.lifetimeEarned ?? 0 });
    } catch {
      // leave whatever we had
    }
  }, [username]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  useEffect(() => {
    const onEarned = (e: Event) => {
      const detail = (e as CustomEvent<PointsEarnedDetail>).detail;
      if (!detail) return;
      setSummary(prev => ({
        balance: detail.balance,
        lifetimeEarned: (prev?.lifetimeEarned ?? 0) + detail.awarded,
      }));
    };
    window.addEventListener(POINTS_EARNED_EVENT, onEarned);
    return () => window.removeEventListener(POINTS_EARNED_EVENT, onEarned);
  }, []);

  return summary;
}
