'use client';
import { useEffect, useState } from 'react';
import type { BadgeMeta } from '@/lib/hive/accountBadges';

export function useAccountBadges(username: string | null | undefined) {
  const [badges, setBadges] = useState<BadgeMeta[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!username) {
      setBadges([]);
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    fetch(`/api/badges/${encodeURIComponent(username)}`, { cache: 'no-store' })
      .then(res => res.json())
      .then(data => {
        if (!cancelled) setBadges(Array.isArray(data.badges) ? data.badges : []);
      })
      .catch(() => {
        if (!cancelled) setBadges([]);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => { cancelled = true; };
  }, [username]);

  return { badges, isLoading };
}
