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
function rememberTicket(
  tickets: Map<string, Promise<string | null>>,
  id: string,
  request: Promise<string | null>,
): Promise<string | null> {
  const pending = request.then((ticket) => {
    if (!ticket) tickets.delete(id);
    return ticket;
  });
  tickets.set(id, pending);
  return pending;
}

export function useGameSessionTicket(username: string | null | undefined, gameId: GameId, sessionId: string | null) {
  const tickets = useRef(new Map<string, Promise<string | null>>());

  useEffect(() => {
    if (!username || !sessionId || tickets.current.has(sessionId)) return;
    rememberTicket(tickets.current, sessionId, requestGameTicket(username, gameId, sessionId));
  }, [username, gameId, sessionId]);

  return useCallback(
    (id: string | undefined): Promise<string | null> => {
      if (!id) return Promise.resolve(null);
      const pending = tickets.current.get(id);
      if (pending) return pending;
      // No ticket was kept for this run (login finished mid-run, or the first
      // request failed). A late ticket only verifies a score that fits in the
      // time since now, so a failed start must not stay cached.
      if (!username) return Promise.resolve(null);
      return rememberTicket(tickets.current, id, requestGameTicket(username, gameId, id));
    },
    [username, gameId],
  );
}
