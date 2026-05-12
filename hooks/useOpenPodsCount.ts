'use client';
import { useEffect, useState } from 'react';
import { HangoutsApiClient, type Room } from '@snapie/hangouts-react';

const API_URL = process.env.NEXT_PUBLIC_HANGOUTS_API_URL;
const POLL_INTERVAL_MS = 30_000;

// Module-level singleton — sidebar, footer nav, and the homepage strip all
// subscribe to one shared interval instead of each mounting their own.
type Subscriber = (rooms: Room[]) => void;
const subscribers = new Set<Subscriber>();
let currentRooms: Room[] = [];
let intervalId: ReturnType<typeof setInterval> | null = null;

function startPolling() {
    if (intervalId !== null) return;
    if (!API_URL) {
        console.error('[useLiveOpenPods] NEXT_PUBLIC_HANGOUTS_API_URL is not defined');
        return;
    }
    const client = new HangoutsApiClient({ baseUrl: API_URL });

    const fetchRooms = () => {
        client
            .listRooms()
            .then((rooms) => {
                currentRooms = rooms;
                subscribers.forEach((cb) => cb(currentRooms));
            })
            .catch((err) => console.error('[useLiveOpenPods] failed to fetch rooms:', err));
    };

    fetchRooms();
    intervalId = setInterval(fetchRooms, POLL_INTERVAL_MS);
}

function stopPolling() {
    if (intervalId !== null) {
        clearInterval(intervalId);
        intervalId = null;
    }
}

export function useLiveOpenPods(): Room[] {
    const [rooms, setRooms] = useState<Room[]>(currentRooms);

    useEffect(() => {
        if (!API_URL) return;

        subscribers.add(setRooms);
        if (subscribers.size === 1) startPolling();

        return () => {
            subscribers.delete(setRooms);
            if (subscribers.size === 0) stopPolling();
        };
    }, []);

    return rooms;
}

export function useOpenPodsCount(): number {
    return useLiveOpenPods().length;
}
