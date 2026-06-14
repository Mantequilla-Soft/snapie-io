'use client';
import { createContext, useContext, useState, useEffect, useRef, useCallback, type ReactNode } from 'react';
import { HangoutsApiClient, loginWithSignFn, type CreateEventInput, type HangoutsEvent, type StartEventResponse } from '@snapie/hangouts-core';
import { KeyTypes } from '@aioha/aioha';
import { useAioha } from '@aioha/react-ui';
import { signMessageWithAioha } from '@/lib/hive/aioha';
import { useCurrentUser } from '@/hooks/useCurrentUser';

const HANGOUTS_API_URL = process.env.NEXT_PUBLIC_HANGOUTS_API_URL || '';
const OPENPODS_ENABLED = !!HANGOUTS_API_URL;
const TOKEN_STORAGE_MODE = (process.env.NEXT_PUBLIC_HANGOUTS_TOKEN_STORAGE || 'none') as 'none' | 'session' | 'local';
const TOKEN_STORAGE_PREFIX = 'hh_session_';

type TokenStorage = {
  read(username: string | null | undefined): string | null;
  write(username: string | null | undefined, token: string): void;
  clear(username: string | null | undefined): void;
};

const NOOP_STORAGE: TokenStorage = {
  read: () => null,
  write: () => {},
  clear: () => {},
};

// `local` survives browser restarts (XSS-readable for up to the JWT TTL).
// `session` survives reloads in the same tab. `none` re-signs every visit.
function buildTokenStorage(mode: 'none' | 'session' | 'local'): TokenStorage {
  if (mode === 'none' || typeof window === 'undefined') return NOOP_STORAGE;
  const store = mode === 'session' ? window.sessionStorage : window.localStorage;
  return {
    read(username) {
      if (!username) return null;
      try {
        const raw = store.getItem(TOKEN_STORAGE_PREFIX + username);
        if (!raw) return null;
        // Decode the JWT exp claim — drop tokens expiring within 30s so we
        // don't hand the server a token it'll immediately reject.
        const payload = JSON.parse(atob(raw.split('.')[1]));
        if (payload.exp && payload.exp * 1000 < Date.now() + 30_000) {
          store.removeItem(TOKEN_STORAGE_PREFIX + username);
          return null;
        }
        return raw;
      } catch {
        try { store.removeItem(TOKEN_STORAGE_PREFIX + username); } catch { /* ignore */ }
        return null;
      }
    },
    write(username, token) {
      if (!username) return;
      try { store.setItem(TOKEN_STORAGE_PREFIX + username, token); } catch { /* ignore */ }
    },
    clear(username) {
      if (!username) return;
      try { store.removeItem(TOKEN_STORAGE_PREFIX + username); } catch { /* ignore */ }
    },
  };
}

// Module-level shared state so concurrent callers share one request and one cache.
const sessionCache = new Map<string, string>();
let pendingLogin: { user: string; promise: Promise<string> } | null = null;

const hangoutsClient = OPENPODS_ENABLED
  ? new HangoutsApiClient({ baseUrl: HANGOUTS_API_URL })
  : null;

interface HangoutContextType {
  activeRoom: string | null;
  openRoom: (roomName: string) => boolean;
  closeRoom: () => void;
  sessionToken: string | null;
  sessionLoading: boolean;
  error: string | null;
  retryLogin: (requestedUser?: string) => Promise<string | null>;
  attendEvent: (id: string) => Promise<{ attendees: string[]; attendeeCount: number } | null>;
  unattendEvent: (id: string) => Promise<{ attendees: string[]; attendeeCount: number } | null>;
  createEvent: (input: CreateEventInput) => Promise<HangoutsEvent | null>;
  startEvent: (id: string) => Promise<StartEventResponse | null>;
  cancelEvent: (id: string) => Promise<void>;
}

const HangoutContext = createContext<HangoutContextType | undefined>(undefined);

export function HangoutContextProvider({ children }: { children: ReactNode }) {
  const [activeRoom, setActiveRoom] = useState<string | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [sessionLoading, setSessionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { aioha } = useAioha();
  const { username: user } = useCurrentUser();
  const storageRef = useRef(buildTokenStorage(TOKEN_STORAGE_MODE));

  const loginToHangouts = useCallback(async (requestedUser?: string): Promise<string | null> => {
    const targetUser = requestedUser ?? user ?? null;
    if (!OPENPODS_ENABLED || !targetUser || !hangoutsClient || !aioha) return null;

    // `user` is captured via closure; this drops tokens for an account swap
    // that lands mid-sign so we don't apply a token to the wrong account.
    const isStillCurrentUser = () => user === targetUser;

    // Cache hit — adopt instantly. Also pulls from persistent storage when enabled.
    let cached = sessionCache.get(targetUser);
    if (!cached) {
      const persisted = storageRef.current.read(targetUser);
      if (persisted) {
        cached = persisted;
        sessionCache.set(targetUser, persisted);
      }
    }
    if (cached) {
      if (isStillCurrentUser()) {
        hangoutsClient.setSessionToken(cached);
        setSessionToken(cached);
      }
      return cached;
    }

    // In-flight dedup: another consumer already started signing for this user.
    if (pendingLogin?.user === targetUser) {
      try {
        const token = await pendingLogin.promise;
        if (isStillCurrentUser()) setSessionToken(token);
        return token;
      } catch { /* error already logged by the initiating call */ }
      return null;
    }

    // Another account is mid-signature — wait, then retry only if still current.
    if (pendingLogin) {
      setSessionLoading(true);
      try {
        await pendingLogin.promise;
      } catch { /* ignore */ }
      return isStillCurrentUser() ? loginToHangouts(targetUser) : null;
    }

    setSessionLoading(true);
    setError(null);

    const signFn = async (message: string): Promise<string> => {
      const res = await signMessageWithAioha(message, KeyTypes.Posting);
      return res.result;
    };

    const loginPromise = loginWithSignFn(hangoutsClient, targetUser, signFn)
      .then(session => {
        const tokenUser = session.username || targetUser;
        sessionCache.set(tokenUser, session.token);
        storageRef.current.write(tokenUser, session.token);
        if (isStillCurrentUser()) {
          hangoutsClient.setSessionToken(session.token);
        } else {
          hangoutsClient.clearSessionToken();
        }
        return session.token;
      })
      .catch(err => {
        console.error('[OpenPods] Session auth failed:', err);
        throw err;
      })
      .finally(() => {
        if (pendingLogin?.user === targetUser) pendingLogin = null;
      });

    pendingLogin = { user: targetUser, promise: loginPromise };

    try {
      const token = await loginPromise;
      if (isStillCurrentUser()) setSessionToken(token);
      return token;
    } catch (err) {
      if (isStillCurrentUser()) {
        setSessionToken(null);
        setError(err instanceof Error ? err.message : 'Login failed');
      }
      return null;
    } finally {
      if (isStillCurrentUser()) setSessionLoading(false);
    }
  }, [user, aioha]);

  const openRoom = useCallback((roomName: string) => {
    if (!roomName) return false;

    // Authenticated user → lazy-sign for a hangouts session token.
    // Unauthenticated visitor → still allowed: the SDK's `guestFallback`
    // takes them to /listen (no token needed).
    if (user && !sessionToken && !sessionLoading) {
      loginToHangouts(user);
    }

    setActiveRoom(roomName);
    return true;
  }, [user, sessionToken, sessionLoading, loginToHangouts]);

  // User-transition effect: clear hangouts state on logout or account swap,
  // and restore a persisted token on first mount. Comparing USER identity
  // (not `authenticated`) avoids clearing during the async store rehydrate.
  const prevUserRef = useRef<string | null>(null);
  const isInitialMountRef = useRef(true);

  useEffect(() => {
    if (!OPENPODS_ENABLED) return;
    const prev = prevUserRef.current;
    const sameUser = prev === user;
    prevUserRef.current = user ?? null;
    if (sameUser) return;

    if (isInitialMountRef.current) {
      // First run: restore persisted token if any. Do NOT touch activeRoom —
      // a deep-link page-level effect may already have set it.
      isInitialMountRef.current = false;
      if (user) {
        const persisted = storageRef.current.read(user);
        if (persisted) {
          sessionCache.set(user, persisted);
          if (hangoutsClient) hangoutsClient.setSessionToken(persisted);
          setSessionToken(persisted);
        }
      }
      return;
    }

    if (user) {
      // Login or account swap — reset and try to restore the new user's token.
      setActiveRoom(null);
      setSessionToken(null);
      setError(null);
      if (hangoutsClient) hangoutsClient.clearSessionToken();
      const persisted = storageRef.current.read(user);
      if (persisted) {
        sessionCache.set(user, persisted);
        if (hangoutsClient) hangoutsClient.setSessionToken(persisted);
        setSessionToken(persisted);
      }
    } else {
      // Full logout — drop the previous user's persisted token so they can't
      // share a device and silently re-enter someone else's session.
      if (prev) storageRef.current.clear(prev);
      setActiveRoom(null);
      setSessionToken(null);
      setSessionLoading(false);
      setError(null);
      sessionCache.clear();
      if (hangoutsClient) hangoutsClient.clearSessionToken();
    }
  }, [user]);

  const attendEvent = useCallback(async (id: string) => {
    if (!hangoutsClient) return null;
    try { return await hangoutsClient.attendEvent(id); } catch { return null; }
  }, []);

  const unattendEvent = useCallback(async (id: string) => {
    if (!hangoutsClient) return null;
    try { return await hangoutsClient.unattendEvent(id); } catch { return null; }
  }, []);

  const createEvent = useCallback(async (input: CreateEventInput) => {
    if (!hangoutsClient) return null;
    try { return await hangoutsClient.createEvent(input); } catch { return null; }
  }, []);

  const startEvent = useCallback(async (id: string) => {
    if (!hangoutsClient) return null;
    try { return await hangoutsClient.startEvent(id); } catch { return null; }
  }, []);

  const cancelEvent = useCallback(async (id: string) => {
    if (!hangoutsClient) return;
    try { await hangoutsClient.cancelEvent(id); } catch { /* ignore */ }
  }, []);

  return (
    <HangoutContext.Provider value={{
      activeRoom,
      openRoom,
      closeRoom: () => setActiveRoom(null),
      sessionToken,
      sessionLoading,
      error,
      retryLogin: loginToHangouts,
      attendEvent,
      unattendEvent,
      createEvent,
      startEvent,
      cancelEvent,
    }}>
      {children}
    </HangoutContext.Provider>
  );
}

export function useHangout() {
  const context = useContext(HangoutContext);
  if (context === undefined) {
    throw new Error('useHangout must be used within a HangoutContextProvider');
  }
  return context;
}
