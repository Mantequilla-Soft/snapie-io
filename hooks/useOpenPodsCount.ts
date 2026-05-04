'use client';
import { useEffect, useState } from 'react';
import { HangoutsApiClient } from '@snapie/hangouts-react';

const API_URL = process.env.NEXT_PUBLIC_HANGOUTS_API_URL;
const POLL_INTERVAL_MS = 30_000;

// Module-level singleton — Sidebar and FooterNavigation share one interval
// instead of each mounting their own.
type Subscriber = (count: number) => void;
const subscribers = new Set<Subscriber>();
let currentCount = 0;
let intervalId: ReturnType<typeof setInterval> | null = null;

function startPolling() {
    if (intervalId !== null) return;
    const client = new HangoutsApiClient({ baseUrl: API_URL! });

    const fetchCount = () => {
        client
            .listRooms()
            .then((rooms) => {
                currentCount = rooms.length;
                subscribers.forEach((cb) => cb(currentCount));
            })
            .catch((err) => console.error('[useOpenPodsCount] failed to fetch rooms:', err));
    };

    fetchCount();
    intervalId = setInterval(fetchCount, POLL_INTERVAL_MS);
}

function stopPolling() {
    if (intervalId !== null) {
        clearInterval(intervalId);
        intervalId = null;
    }
}

export function useOpenPodsCount(): number {
    const [count, setCount] = useState(currentCount);

    useEffect(() => {
        if (!API_URL) {
            console.error('[useOpenPodsCount] NEXT_PUBLIC_HANGOUTS_API_URL is not defined');
            return;
        }

        subscribers.add(setCount);
        if (subscribers.size === 1) startPolling();

        return () => {
            subscribers.delete(setCount);
            if (subscribers.size === 0) stopPolling();
        };
    }, []);

    return count;
}
