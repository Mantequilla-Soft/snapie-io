'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { HangoutsApiClient, loginWithSignFn } from '@snapie/hangouts-react';
import { KeyTypes, signMessageWithAioha } from '@/lib/hive/aioha';

/**
 * Authenticates with the Hangouts API using whichever provider the user is
 * logged in with under aioha. Replaces the SDK's built-in `useHangoutsAuth().login`
 * (which hard-codes `window.hive_keychain.requestSignBuffer`).
 *
 * Returns the session token for piping into <HangoutsProvider sessionToken={…}>.
 *
 * The resolved token is cached at module level so the /hangouts page and the
 * globally-mounted HangoutModal share one login instead of asking the user to
 * approve twice (once on the lobby, once when joining a room).
 */
const tokenCache = new Map<string, string>();
// Tracks whichever in-flight login is currently signing for a given username,
// so two consumers mounting at once share a single HiveAuth approval instead
// of both kicking off their own dance.
const inflightLogins = new Map<string, Promise<string>>();

export function useHangoutsSession(user: string | null, apiBaseUrl: string) {
  const [sessionToken, setSessionToken] = useState<string | undefined>(() =>
    user ? tokenCache.get(user) : undefined,
  );
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const clientRef = useRef<HangoutsApiClient | null>(null);
  const lastUserRef = useRef<string | null>(null);
  const loginAttemptedRef = useRef<string | null>(null);

  const login = useCallback(
    async (username: string) => {
      // Short-circuit on cache hit so the second consumer doesn't sign again.
      const cached = tokenCache.get(username);
      if (cached) {
        setSessionToken(cached);
        return cached;
      }

      // Dedupe concurrent calls: if another consumer already started the dance
      // for this username, wait on that promise.
      const existing = inflightLogins.get(username);
      if (existing) {
        setIsLoading(true);
        try {
          const token = await existing;
          setSessionToken(token);
          return token;
        } finally {
          setIsLoading(false);
        }
      }

      if (!clientRef.current) {
        clientRef.current = new HangoutsApiClient({ baseUrl: apiBaseUrl });
      }
      setIsLoading(true);
      setError(null);

      const dance = (async () => {
        // Delegate challenge-sign-verify to the SDK, plugging in aioha as the
        // signer. Works with whichever provider the user chose at login.
        const session = await loginWithSignFn(clientRef.current!, username, async (challenge) => {
          const sig = await signMessageWithAioha(
            challenge,
            KeyTypes.Posting,
            'Approve hangouts login',
          );
          return sig.result;
        });
        tokenCache.set(username, session.token);
        return session.token;
      })();
      inflightLogins.set(username, dance);

      try {
        const token = await dance;
        setSessionToken(token);
        return token;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Login failed');
        throw err;
      } finally {
        inflightLogins.delete(username);
        setIsLoading(false);
      }
    },
    [apiBaseUrl],
  );

  useEffect(() => {
    // User logged out of Snapie — clear the session everywhere.
    if (!user) {
      setSessionToken(undefined);
      setError(null);
      loginAttemptedRef.current = null;
      lastUserRef.current = null;
      return;
    }

    // User switched accounts — drop the old token and attempt re-auth.
    if (lastUserRef.current && lastUserRef.current !== user) {
      tokenCache.delete(lastUserRef.current);
      setSessionToken(undefined);
      loginAttemptedRef.current = null;
    }
    lastUserRef.current = user;

    // Cache hit — adopt the already-signed token instantly (second mount).
    const cached = tokenCache.get(user);
    if (cached) {
      if (cached !== sessionToken) setSessionToken(cached);
      return;
    }

    // Auto-login once per user. No automatic retries on failure.
    if (!isLoading && loginAttemptedRef.current !== user) {
      loginAttemptedRef.current = user;
      login(user).catch(() => {});
    }
  }, [user, sessionToken, isLoading, login]);

  const retryLogin = useCallback(async () => {
    if (!user) throw new Error('No user');
    tokenCache.delete(user);
    loginAttemptedRef.current = user;
    await login(user);
  }, [user, login]);

  return { sessionToken, isLoading, error, retryLogin };
}
