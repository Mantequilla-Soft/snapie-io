'use client';
import { useEffect, useState } from 'react';
import { HangoutsApiClient } from '@snapie/hangouts-react';

const API_URL = process.env.NEXT_PUBLIC_HANGOUTS_API_URL!;
const POLL_INTERVAL_MS = 30_000;

export function useOpenPodsCount(): number {
    const [count, setCount] = useState(0);

    useEffect(() => {
        const client = new HangoutsApiClient({ baseUrl: API_URL });

        const fetchCount = () => {
            client.listRooms().then((rooms) => setCount(rooms.length)).catch(() => {});
        };

        fetchCount();
        const id = setInterval(fetchCount, POLL_INTERVAL_MS);
        return () => clearInterval(id);
    }, []);

    return count;
}
