'use client';
import { useState, useEffect } from 'react';

export interface CombflowCategory {
    id: string;
    name: string;
    count: number;
}

export interface CombflowSummary {
    total_posts: number;
    top_categories: CombflowCategory[];
    top_languages: { code: string; count: number }[];
    top_community: { id: string; name: string; count: number } | null;
    first_seen: string;
    last_seen: string;
}

export function useCombflowSummary(username: string) {
    const [summary, setSummary] = useState<CombflowSummary | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (!username) { setIsLoading(false); return; }
        let cancelled = false;
        setIsLoading(true);
        setSummary(null);
        fetch(`/api/combflow/${encodeURIComponent(username)}`)
            .then(r => r.ok ? r.json() : null)
            .then(data => {
                if (!cancelled && data?.summary) setSummary(data.summary);
            })
            .catch(() => {})
            .finally(() => { if (!cancelled) setIsLoading(false); });
        return () => { cancelled = true; };
    }, [username]);

    return { summary, isLoading };
}
