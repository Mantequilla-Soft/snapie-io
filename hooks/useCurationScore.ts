import { useState, useEffect } from 'react';

const CQS_BASE = 'https://mantecurated.3speak.tv';
const TTL_MS = 15 * 60 * 1000;

export interface CurationScore {
  account: string;
  score: number;
  rawScore: number;
  subScores: {
    breadth: number;
    distribution: number;
    antiSelf: number;
  };
  metrics: {
    totalVoteWeight: number;
    uniqueAuthors: number;
    selfVoteWeight: number;
    voteCount: number;
    giniCoefficient: number;
    timeWindow: {
      startDate: string;
      endDate: string;
      daysIncluded: number;
    };
  };
  topAuthors: { author: string; voteCount: number; totalWeight: number }[];
}

interface CacheEntry {
  data: CurationScore;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

export function useCurationScore(username: string) {
  const [data, setData] = useState<CurationScore | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!username) return;

    const cached = cache.get(username);
    if (cached && cached.expiresAt > Date.now()) {
      setData(cached.data);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    fetch(`${CQS_BASE}/api/cqs?account=${encodeURIComponent(username)}`)
      .then(res => {
        if (res.status === 404) throw new Error('no-score');
        if (!res.ok) throw new Error('fetch-failed');
        return res.json();
      })
      .then((json: CurationScore) => {
        cache.set(username, { data: json, expiresAt: Date.now() + TTL_MS });
        setData(json);
        setIsLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setIsLoading(false);
      });
  }, [username]);

  return { data, isLoading, error };
}
