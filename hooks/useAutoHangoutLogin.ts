import { useEffect, useRef } from 'react';

interface HangoutsAuth {
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (username: string) => Promise<void>;
  error: string | null;
}

/**
 * Auto-authenticates with the Hangouts API using the current Hive user.
 * Only attempts login once per mount. Retry is manual via the returned retryLogin.
 */
export function useAutoHangoutLogin(user: string | null, auth: HangoutsAuth) {
  const loginAttempted = useRef(false);

  useEffect(() => {
    if (user && !auth.isAuthenticated && !auth.isLoading && !loginAttempted.current) {
      loginAttempted.current = true;
      auth.login(user).catch(() => {
        // Don't reset loginAttempted — no automatic retries.
        // User can retry manually via retryLogin().
      });
    }
  }, [user, auth.isAuthenticated, auth.isLoading]);

  const retryLogin = () => {
    if (user) {
      loginAttempted.current = true;
      return auth.login(user);
    }
    return Promise.reject(new Error('No user'));
  };

  return { retryLogin };
}
