'use client';
import { useCallback, useEffect, useRef } from 'react';
import { requestGameTicket } from '@/lib/games/scoreClient';
import type { GameId } from '@/lib/games/config';

/**
 * Requests a signed ticket as soon as a run's sessionId exists, so the server
 * records when the run started. `ticketFor(sessionId)` waits for that request
 * when the score is saved. Old sessionIds are kept, because the result being
 * saved belongs to the run that just ended, not the fresh sessionId.
 */
export function useGameSessionTicket(username: string | null | undefined, gameId: GameId, sessionId: string | null) {
  const tickets = useRef(new Map<string, Promise<string | null>>());

  useEffect(() => {
    if (!username || !sessionId || tickets.current.has(sessionId)) return;
    tickets.current.set(sessionId, requestGameTicket(username, gameId, sessionId));
  }, [username, gameId, sessionId]);

  return useCallback(
    (id: string | undefined): Promise<string | null> => {
      if (!id) return Promise.resolve(null);
      const pending = tickets.current.get(id);
      if (pending) return pending;
      // No ticket was requested for this run (e.g. login finished mid-run).
      // A late ticket only verifies a score that fits in the time since now.
      if (!username) return Promise.resolve(null);
      const late = requestGameTicket(username, gameId, id);
      tickets.current.set(id, late);
      return late;
    },
    [username, gameId],
  );
}
