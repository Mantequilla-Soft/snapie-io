'use client';
import { useState, useEffect } from 'react';

export interface CombflowPostData {
    sentiment: 'positive' | 'negative' | 'neutral';
    sentiment_score: number;
    primary_language: string;
    is_nsfw: boolean;
    categories: string[];
    languages: string[];
}

// Module-level cache — avoids refetching the same post within a session
const cache = new Map<string, CombflowPostData>();

export function useCombflowPost(author: string, permlink: string, enabled = true) {
    const key = `${author}/${permlink}`;
    const [postData, setPostData] = useState<CombflowPostData | null>(cache.get(key) ?? null);
    const [isLoading, setIsLoading] = useState(enabled && !cache.has(key));

    useEffect(() => {
        if (!enabled || !author || !permlink) { setIsLoading(false); return; }
        if (cache.has(key)) { setPostData(cache.get(key)!); setIsLoading(false); return; }

        let cancelled = false;
        setIsLoading(true);

        fetch(`/api/combflow/post/${encodeURIComponent(author)}/${encodeURIComponent(permlink)}`)
            .then(r => r.ok ? r.json() : null)
            .then(data => {
                if (cancelled || !data || data.error) return;
                const parsed: CombflowPostData = {
                    sentiment: data.sentiment ?? 'neutral',
                    sentiment_score: data.sentiment_score ?? 0,
                    primary_language: data.primary_language ?? 'en',
                    is_nsfw: data.is_nsfw ?? false,
                    categories: data.categories ?? [],
                    languages: data.languages ?? [],
                };
                cache.set(key, parsed);
                if (!cancelled) setPostData(parsed);
            })
            .catch(() => {})
            .finally(() => { if (!cancelled) setIsLoading(false); });

        return () => { cancelled = true; };
    }, [enabled, key, author, permlink]);

    return { postData, isLoading };
}
