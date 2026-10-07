'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Text, VStack, useToast } from '@chakra-ui/react';
import { ensureSessionToken, POINTS_EARNED_EVENT, type PointsEarnedDetail } from '@/lib/points/client';
import { clearSignDecline, isSignDeclined } from '@/lib/hive/walletSign';
import { BLOCKS_POLL_MS, BLOCKS_WIN_POINTS } from '@/lib/games/blocks/constants';
import {
  BLOCKS_GUEST_BANNER,
  BLOCKS_NEXT_MATCH_BANNER,
  BLOCKS_SKIPPED_BANNER,
  blocksPointsNotice,
  blocksYouWonLine,
  canReplaceBlocksSession,
} from '@/lib/games/blocks/pointsNotice';
import type { BlocksView } from '@/lib/games/blocks/matchDomain';
import { SnapieBlocksBoard } from '@/components/games/snapie-blocks/SnapieBlocks';

const GUEST_KEY = 'snapie-blocks-guest-token';
const PIXEL = "'Press Start 2P', ui-monospace, monospace";
const CYAN = '#41ead4';

interface Session {
  token: string;
  isGuest: boolean;
}

let guestMint: Promise<Session> | null = null;

async function mintGuest(): Promise<Session> {
  const cached = sessionStorage.getItem(GUEST_KEY);
  if (cached) return { token: cached, isGuest: true };
  if (!guestMint) {
    guestMint = (async () => {
      const res = await fetch('/api/games/snapie-blocks/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      const data = (await res.json()) as { token?: string };
      if (!res.ok || !data.token) throw new Error('Could not start a guest session');
      sessionStorage.setItem(GUEST_KEY, data.token);
      return { token: data.token, isGuest: true };
    })().catch((err) => {
      guestMint = null;
      throw err;
    });
  }
  return guestMint;
}

/** Local click sets `queuing`; the server answers with `waiting` until a match starts. */
function isSearching(phase: string) {
  return phase === 'queuing' || phase === 'waiting';
}

async function postJson(path: string, token: string, body: unknown, keepalive = false): Promise<BlocksView> {
  const res = await fetch(path, {
    method: 'POST',
    keepalive,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as BlocksView & { error?: string };
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

export function SnapieBlocksMatch({ username }: { username: string | null }) {
  const toast = useToast();
  const [session, setSession] = useState<Session | null>(null);
  const [signDeclined, setSignDeclined] = useState(false);
  const [enablingPoints, setEnablingPoints] = useState(false);
  const [armedForNext, setArmedForNext] = useState(false);
  const [booting, setBooting] = useState(true);
  const [phase, setPhase] = useState<BlocksView['phase'] | 'queuing'>('idle');
  const [view, setView] = useState<BlocksView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const sessionRef = useRef<Session | null>(null);
  const pendingHive = useRef<Session | null>(null);
  const phaseRef = useRef(phase);
  const matchIdRef = useRef<string | null>(null);
  const ackRef = useRef<string[]>([]);
  const koSent = useRef(false);
  const celebrated = useRef<string | null>(null);
  const leaveTimer = useRef<number | null>(null);
  phaseRef.current = phase;
  sessionRef.current = session;
  matchIdRef.current = view?.matchId ?? matchIdRef.current;

  const revRef = useRef(0);
  const applyView = useCallback((next: BlocksView) => {
    const freshPhase = next.phase === 'idle' || next.phase === 'timeout';
    const rank = (value: string) =>
      value === 'playing' ? 2 : value === 'finished' ? 3 : value === 'waiting' || value === 'queuing' ? 1 : 0;
    const advanced = rank(next.phase) > rank(phaseRef.current);
    // A refresh that left the server before the opponent claimed can arrive
    // after the playing snapshot and would otherwise rewind the board.
    if (rank(phaseRef.current) >= 2 && rank(next.phase) < 2 && !freshPhase) return;
    if (!freshPhase && !advanced && next.updatedAt < revRef.current && next.matchId === matchIdRef.current) return;
    if (next.updatedAt > 0) revRef.current = Math.max(revRef.current, next.updatedAt);
    setView(next);
    setPhase(next.phase);
    if (next.matchId) matchIdRef.current = next.matchId;
    if (next.phase === 'playing' || next.phase === 'waiting') setError(null);
  }, []);

  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        if (username) {
          const token = await ensureSessionToken(username, { silent: true });
          if (token && !cancel) {
            setSession({ token, isGuest: false });
            setSignDeclined(false);
            setBooting(false);
            return;
          }
          if (!cancel) setSignDeclined(isSignDeclined());
        }
        const guest = await mintGuest();
        if (!cancel) setSession(guest);
      } catch (err) {
        if (!cancel) setError(err instanceof Error ? err.message : 'Could not start');
      } finally {
        if (!cancel) setBooting(false);
      }
    })();
    return () => {
      cancel = true;
    };
  }, [username]);

  useEffect(() => {
    if (!isSearching(phase) && phase !== 'playing') return;
    const token = session?.token;
    if (!token) return;
    let stop = false;
    const tick = async () => {
      if (stop) return;
      try {
        if (isSearching(phaseRef.current)) {
          const view = await postJson('/api/games/snapie-blocks/queue', token, { action: 'tick' });
          if (!stop) applyView(view);
          return;
        }
        const matchId = matchIdRef.current;
        if (!matchId || phaseRef.current !== 'playing') return;
        const ack = ackRef.current.splice(0, ackRef.current.length);
        try {
          const view = await postJson(`/api/games/snapie-blocks/matches/${matchId}`, token, { type: 'poll', ack });
          if (stop) {
            ackRef.current.unshift(...ack);
            return;
          }
          applyView(view);
        } catch (err) {
          ackRef.current.unshift(...ack);
          throw err;
        }
      } catch (err) {
        if (!stop) setError(err instanceof Error ? err.message : 'Connection problem');
      }
    };
    const id = window.setInterval(() => void tick(), BLOCKS_POLL_MS);
    void tick();
    return () => {
      stop = true;
      window.clearInterval(id);
    };
  }, [phase, session?.token, applyView]);

  useEffect(() => {
    if (!isSearching(phase) || !view?.queueExpiresAt) return;
    const id = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(id);
  }, [phase, view?.queueExpiresAt]);

  const winKey =
    view?.phase === 'finished' && view.winner === 'you' && view.awardStatus === 'awarded' && view.pointsAwarded > 0
      ? `${view.matchId}:${view.pointsAwarded}`
      : null;
  useEffect(() => {
    if (!winKey || !username || !view?.matchId) return;
    if (celebrated.current === view.matchId) return;
    celebrated.current = view.matchId;
    const awarded = view.pointsAwarded;
    let cancel = false;
    void (async () => {
      let balance = 0;
      try {
        const res = await fetch(`/api/points/summary?username=${encodeURIComponent(username)}`);
        if (res.ok) {
          const data = (await res.json()) as { balance?: number };
          balance = data.balance ?? 0;
        }
      } catch {
        // The summary hook refetches when the earned event lands.
      }
      if (cancel) return;
      window.dispatchEvent(
        new CustomEvent<PointsEarnedDetail>(POINTS_EARNED_EVENT, {
          detail: { awarded, balance },
        }),
      );
      toast({
        title: 'You won',
        description: `+${awarded} Snapie Points`,
        status: 'success',
        duration: 4000,
        isClosable: true,
      });
    })();
    return () => {
      cancel = true;
    };
  }, [toast, username, view?.matchId, view?.pointsAwarded, winKey]);

  const send = useCallback(
    async (body: unknown) => {
      const token = sessionRef.current?.token;
      const matchId = matchIdRef.current;
      if (!token || !matchId) return;
      try {
        applyView(await postJson(`/api/games/snapie-blocks/matches/${matchId}`, token, body));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not reach the match');
      }
    },
    [applyView],
  );

  const onClear = useCallback(
    (lines: number, eventId: string) => {
      void send({ type: 'attack', lines, eventId });
    },
    [send],
  );

  const onTopOut = useCallback(() => {
    if (koSent.current) return;
    koSent.current = true;
    void send({ type: 'ko' });
  }, [send]);

  const onGarbageApplied = useCallback((ids: string[]) => {
    for (const id of ids) {
      if (!ackRef.current.includes(id)) ackRef.current.push(id);
    }
  }, []);

  const leave = useCallback(
    (keepalive = false) => {
      const token = sessionRef.current?.token;
      const current = phaseRef.current;
      const matchId = matchIdRef.current;
      if (!token || (!isSearching(current) && current !== 'playing')) return;
      if (isSearching(current)) {
        void postJson('/api/games/snapie-blocks/queue', token, { action: 'cancel' }, keepalive).catch(() => undefined);
        return;
      }
      if (!matchId) return;
      void postJson(`/api/games/snapie-blocks/matches/${matchId}`, token, { type: 'forfeit' }, keepalive).catch(
        () => undefined,
      );
    },
    [],
  );

  useEffect(() => {
    if (leaveTimer.current) {
      window.clearTimeout(leaveTimer.current);
      leaveTimer.current = null;
    }
    const onHide = () => leave(true);
    window.addEventListener('pagehide', onHide);
    return () => {
      window.removeEventListener('pagehide', onHide);
      const token = sessionRef.current?.token;
      const current = phaseRef.current;
      if (!token || (!isSearching(current) && current !== 'playing')) return;
      leaveTimer.current = window.setTimeout(() => leave(true), 600);
    };
  }, [leave, phase, view?.matchId]);

  const enablePoints = async () => {
    if (!username || enablingPoints) return;
    setEnablingPoints(true);
    try {
      clearSignDecline();
      const token = await ensureSessionToken(username);
      if (!token) {
        setSignDeclined(isSignDeclined());
        return;
      }
      const next: Session = { token, isGuest: false };
      if (canReplaceBlocksSession(phaseRef.current)) {
        pendingHive.current = null;
        setArmedForNext(false);
        setSignDeclined(false);
        setSession(next);
        return;
      }
      pendingHive.current = next;
      setSignDeclined(false);
      setArmedForNext(true);
    } finally {
      setEnablingPoints(false);
    }
  };

  const queue = () => {
    if (pendingHive.current) {
      const next = pendingHive.current;
      pendingHive.current = null;
      sessionRef.current = next;
      setSession(next);
      setArmedForNext(false);
    }
    koSent.current = false;
    ackRef.current = [];
    celebrated.current = null;
    revRef.current = 0;
    matchIdRef.current = null;
    setView(null);
    setError(null);
    setPhase('queuing');
  };

  const cancel = async () => {
    const token = session?.token;
    if (!token) return;
    try {
      if (phase === 'playing' && matchIdRef.current) {
        applyView(await postJson(`/api/games/snapie-blocks/matches/${matchIdRef.current}`, token, { type: 'forfeit' }));
      } else {
        applyView(await postJson('/api/games/snapie-blocks/queue', token, { action: 'cancel' }));
        setPhase('idle');
        setView(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not leave');
    }
  };

  const secondsLeft =
    view?.queueExpiresAt != null ? Math.max(0, Math.ceil((view.queueExpiresAt - now) / 1000)) : null;

  const resultCopy = (() => {
    if (view?.phase !== 'finished') return null;
    if (view.winner === 'you') {
      return blocksYouWonLine({
        loggedIn: !!username,
        guestSession: !!session?.isGuest,
        armedForNext,
        awardStatus: view.awardStatus,
        pointsAwarded: view.pointsAwarded,
        winPoints: BLOCKS_WIN_POINTS,
      });
    }
    if (view.winner === 'opponent') {
      const why =
        view.winReason === 'disconnect' ? 'Connection lost.' : view.winReason === 'forfeit' ? 'Forfeit.' : 'Board down.';
      return `${why} ${view.opponent?.name ?? 'Opponent'} wins.`;
    }
    return 'Match over.';
  })();

  const pointsNotice = blocksPointsNotice({
    loggedIn: !!username,
    guestSession: !!session?.isGuest,
    signDeclined,
  });

  return (
    <VStack align="stretch" spacing={4}>
      {armedForNext && session?.isGuest && (
        <Text fontSize="sm" color="fg.muted">
          {BLOCKS_NEXT_MATCH_BANNER}
        </Text>
      )}
      {!armedForNext && pointsNotice === 'guest' && (
        <Text fontSize="sm" color="fg.muted">
          {BLOCKS_GUEST_BANNER}
        </Text>
      )}
      {!armedForNext && pointsNotice === 'skipped' && (
        <VStack align="start" spacing={1}>
          <Text fontSize="sm" color="fg.muted">
            {BLOCKS_SKIPPED_BANNER}
          </Text>
          <Button
            variant="link"
            size="sm"
            colorScheme="orange"
            onClick={() => void enablePoints()}
            isLoading={enablingPoints}
          >
            Enable Snapie Points
          </Button>
        </VStack>
      )}
      {pointsNotice === 'earning' && (
        <Text fontSize="sm" color="fg.muted">
          A win awards {BLOCKS_WIN_POINTS} Snapie Points, settled on the server.
        </Text>
      )}
      {error && (
        <Text fontSize="sm" color="orange.300">
          {error}
        </Text>
      )}

      {phase === 'playing' || phase === 'finished' ? (
        <SnapieBlocksBoard
          matchKey={view?.matchId ?? 'match'}
          running={phase === 'playing'}
          opponent={view?.opponent ?? null}
          linesSent={view?.you?.linesSent ?? 0}
          incoming={view?.incoming ?? []}
          onClear={onClear}
          onTopOut={onTopOut}
          onGarbageApplied={onGarbageApplied}
          overlay={
            phase === 'finished' ? (
              <VStack spacing={3}>
                <Text fontFamily={PIXEL} fontSize="14px" color={CYAN}>
                  {view?.winner === 'you' ? 'YOU WIN' : 'YOU LOSE'}
                </Text>
                <Text fontFamily={PIXEL} fontSize="8px" color="white" lineHeight="1.8">
                  {resultCopy}
                </Text>
                <Button size="sm" colorScheme="orange" onClick={queue}>
                  Quick match
                </Button>
              </VStack>
            ) : null
          }
        />
      ) : (
        <VStack
          spacing={4}
          py={10}
          px={4}
          borderWidth="2px"
          borderColor="#41ead4"
          bg="#1a1c2c"
          color="#f4f4f4"
          fontFamily={PIXEL}
        >
          <Text fontSize="14px" color="#41ead4">
            SNAPIE BLOCKS
          </Text>
          <Text fontSize="8px" textAlign="center" lineHeight="2" color="#94b0c2">
            {isSearching(phase)
              ? `SEARCHING${secondsLeft != null ? ` ${secondsLeft}s` : ''}`
              : phase === 'timeout'
                ? 'NO OPPONENT FOUND'
                : '1V1 GARBAGE BATTLE'}
          </Text>
          <Text fontSize="8px" textAlign="center" lineHeight="2" color="#94b0c2">
            LAST BOARD STANDING WINS
          </Text>
          {isSearching(phase) ? (
            <Button size="sm" variant="outline" colorScheme="orange" onClick={() => void cancel()} isDisabled={booting}>
              Cancel
            </Button>
          ) : (
            <Button size="sm" colorScheme="orange" onClick={queue} isDisabled={booting || !session}>
              {booting ? 'Starting…' : 'Quick match'}
            </Button>
          )}
        </VStack>
      )}

      {phase === 'playing' && (
        <Button size="sm" variant="ghost" alignSelf="center" onClick={() => void cancel()}>
          Forfeit
        </Button>
      )}
    </VStack>
  );
}
