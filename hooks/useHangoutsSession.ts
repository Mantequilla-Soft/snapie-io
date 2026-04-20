'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { HangoutsApiClient } from '@snapie/hangouts-react';
import { KeyTypes, signMessageWithAioha } from '@/lib/hive/aioha';

/**
 * Authenticates with the Hangouts API using whichever provider the user is
 * logged in with under aioha. Replaces the SDK's built-in `useHangoutsAuth().login`
 * (which hard-codes `window.hive_keychain.requestSignBuffer`).
 *
 * Returns the session token for piping into <HangoutsProvider sessionToken={…}>.
 */
export function useHangoutsSession(user: string | null, apiBaseUrl: string) {
  const [sessionToken, setSessionToken] = useState<string | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const clientRef = useRef<HangoutsApiClient | null>(null);
  const lastUserRef = useRef<string | null>(null);
  const loginAttemptedRef = useRef<string | null>(null);

  const login = useCallback(
    async (username: string) => {
      if (!clientRef.current) {
        clientRef.current = new HangoutsApiClient({ baseUrl: apiBaseUrl });
      }
      setIsLoading(true);
      setError(null);
      try {
        const { challenge } = await clientRef.current.requestChallenge(username);
        const sig = await signMessageWithAioha(
          challenge,
          KeyTypes.Posting,
          'Approve hangouts login',
        );
        const session = await clientRef.current.verifySignature(
          username,
          challenge,
          sig.result,
        );
        setSessionToken(session.token);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Login failed');
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [apiBaseUrl],
  );

  useEffect(() => {
    // User logged out of Snapie — clear the session.
    if (!user) {
      setSessionToken(undefined);
      setError(null);
      loginAttemptedRef.current = null;
      lastUserRef.current = null;
      return;
    }

    // User switched accounts — drop the old token and attempt re-auth.
    if (lastUserRef.current && lastUserRef.current !== user) {
      setSessionToken(undefined);
      loginAttemptedRef.current = null;
    }
    lastUserRef.current = user;

    // Auto-login once per user. No automatic retries on failure.
    if (!sessionToken && !isLoading && loginAttemptedRef.current !== user) {
      loginAttemptedRef.current = user;
      login(user).catch(() => {});
    }
  }, [user, sessionToken, isLoading, login]);

  const retryLogin = useCallback(() => {
    if (!user) return Promise.reject(new Error('No user'));
    loginAttemptedRef.current = user;
    return login(user);
  }, [user, login]);

  return { sessionToken, isLoading, error, retryLogin };
}
