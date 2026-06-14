'use client';
import { useEffect, useState } from 'react';
import { HangoutsApiClient, type HangoutsEvent } from '@snapie/hangouts-core';

const API_URL = process.env.NEXT_PUBLIC_HANGOUTS_API_URL;
const POLL_INTERVAL_MS = 60_000;

type Subscriber = (events: HangoutsEvent[]) => void;
const subscribers = new Set<Subscriber>();
let currentEvents: HangoutsEvent[] = [];
let intervalId: ReturnType<typeof setInterval> | null = null;

function startPolling() {
  if (intervalId !== null) return;
  if (!API_URL) return;

  const client = new HangoutsApiClient({ baseUrl: API_URL });

  const fetchEvents = () => {
    client
      .listEvents({ limit: 8 })
      .then((events) => {
        currentEvents = events;
        subscribers.forEach((cb) => cb(currentEvents));
      })
      .catch((err) => console.error('[useUpcomingEvents] failed to fetch events:', err));
  };

  fetchEvents();
  intervalId = setInterval(fetchEvents, POLL_INTERVAL_MS);
}

function stopPolling() {
  if (intervalId !== null) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

export function useUpcomingEvents(): HangoutsEvent[] {
  const [events, setEvents] = useState<HangoutsEvent[]>(currentEvents);

  useEffect(() => {
    if (!API_URL) return;

    subscribers.add(setEvents);
    if (subscribers.size === 1) startPolling();

    return () => {
      subscribers.delete(setEvents);
      if (subscribers.size === 0) stopPolling();
    };
  }, []);

  return events;
}
