'use client';
import { useEffect, useState } from 'react';
import { HangoutsApiClient, type UserPresence } from '@snapie/hangouts-core';

const API_URL = process.env.NEXT_PUBLIC_HANGOUTS_API_URL;
const POLL_INTERVAL_MS = 30_000;

const client = API_URL ? new HangoutsApiClient({ baseUrl: API_URL }) : null;

interface PresenceState {
  presence: UserPresence | null;
  intervalId: ReturnType<typeof setInterval> | null;
  subscribers: Set<(p: UserPresence | null) => void>;
}

const presenceMap = new Map<string, PresenceState>();

function getOrCreate(username: string): PresenceState {
  if (!presenceMap.has(username)) {
    presenceMap.set(username, { presence: null, intervalId: null, subscribers: new Set() });
  }
  return presenceMap.get(username)!;
}

function startPollingUser(username: string) {
  const state = getOrCreate(username);
  if (state.intervalId !== null || !client) return;

  const fetchPresence = () => {
    client
      .getUserPresence(username)
      .then((p) => {
        state.presence = p;
        state.subscribers.forEach((cb) => cb(p));
      })
      .catch(() => {});
  };

  fetchPresence();
  state.intervalId = setInterval(fetchPresence, POLL_INTERVAL_MS);
}

function stopPollingUser(username: string) {
  const state = presenceMap.get(username);
  if (!state || state.subscribers.size > 0) return;
  if (state.intervalId !== null) {
    clearInterval(state.intervalId);
    state.intervalId = null;
  }
  presenceMap.delete(username);
}

export function useUserPresence(username: string | null): UserPresence | null {
  const [presence, setPresence] = useState<UserPresence | null>(
    username ? (presenceMap.get(username)?.presence ?? null) : null
  );

  useEffect(() => {
    if (!username || !API_URL) return;

    const state = getOrCreate(username);
    state.subscribers.add(setPresence);
    if (state.presence) setPresence(state.presence);
    startPollingUser(username);

    return () => {
      state.subscribers.delete(setPresence);
      stopPollingUser(username);
    };
  }, [username]);

  return presence;
}
