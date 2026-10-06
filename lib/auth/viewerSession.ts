// A Snapie session cookie (snapieauth_session) is httpOnly, so page code
// cannot see it. The auth server sets a readable snapieauth_csrf cookie in
// the same startSession() call. Hive wallet login stores hiveuser in
// localStorage and hive_username as a cookie. Any one of those means a
// viewer session already exists; none of them means logged out.

export const VIEWER_SESSION_EVENT = 'snapie:viewer-session';

const SESSION_COOKIE_NAMES = ['snapieauth_csrf', 'hive_username'];

export function hasViewerSessionMarker(): boolean {
  if (typeof document === 'undefined') return false;
  try {
    if (window.localStorage.getItem('hiveuser')) return true;
  } catch {
    // Storage can throw in private mode. The cookies below still count.
  }
  return document.cookie.split(';').some((part) => {
    const name = part.trim().split('=')[0];
    return SESSION_COOKIE_NAMES.includes(name);
  });
}

/** Fired after a Snapie or Hive session is written or cleared, so hooks that
 *  skipped their fetch while logged out can start once a marker exists. */
export function notifyViewerSession(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(VIEWER_SESSION_EVENT));
  }
}
