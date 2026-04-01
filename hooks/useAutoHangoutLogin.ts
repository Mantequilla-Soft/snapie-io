import { useEffect, useRef } from 'react';

interface HangoutsAuth {
  username: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (username: string) => Promise<void>;
  logout: () => void;
  error: string | null;
}

/**
 * Auto-authenticates with the Hangouts API using the current Hive user.
 * Handles account switches by logging out and re-authenticating.
 * Only attempts login once per user. Retry is manual via retryLogin.
 */
export function useAutoHangoutLogin(user: string | null, auth: HangoutsAuth) {
  const loginAttempted = useRef<string | null>(null);

  useEffect(() => {
    // User logged out of Snapie — logout from hangouts too
    if (!user && auth.isAuthenticated) {
      auth.logout();
      loginAttempted.current = null;
      return;
    }

    // User switched accounts — logout old session and re-authenticate
    if (user && auth.isAuthenticated && auth.username && auth.username !== user) {
      auth.logout();
      loginAttempted.current = null;
      return; // Will re-trigger on next render after logout
    }

    // Auto-login if user is set but not authenticated
    if (user && !auth.isAuthenticated && !auth.isLoading && loginAttempted.current !== user) {
      loginAttempted.current = user;
      auth.login(user).catch(() => {
        // Don't reset loginAttempted — no automatic retries.
      });
    }
  // auth.login and auth.logout are stable refs from HangoutsProvider
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, auth.isAuthenticated, auth.isLoading, auth.username]);

  const retryLogin = () => {
    if (user) {
      loginAttempted.current = user;
      return auth.login(user);
    }
    return Promise.reject(new Error('No user'));
  };

  return { retryLogin };
}
