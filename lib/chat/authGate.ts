/**
 * Whether the chat composer should be replaced by the login / Keychain gate.
 *
 * `hasUsableSession` is a non-expired `hive-chat-token`: a 7-day JWT minted
 * once the posting key signed a challenge. That token is the chat session.
 * Do not also require an in-memory "Connect was clicked in this mount" flag.
 * That flag starts unset every time the panel mounts (a route change can
 * remount it) and would ask Keychain to sign again for a session that is
 * still valid.
 *
 * Keychain stays required when there is no usable token: first connect,
 * expiry, or a session the server rejected. A rejected mutation clears the
 * stored token in ChatService; the panel re-renders and this gate follows
 * isAuthenticated(), not the in-memory auth flag.
 * A logged-out Hive user sees "log in" even if a token is still stored, so
 * logout does not leave a live composer behind.
 *
 * A different Hive account is not decided here. The effect in ChatPanel that
 * compares chatService.getTokenUsername() with the logged-in user calls
 * logout() first; once that token is gone, this gate shows for the same
 * "no usable session" reason.
 */
export function shouldShowChatAuthGate(
  hiveUsername: string | null | undefined,
  hasUsableSession: boolean,
): boolean {
  return !hiveUsername || !hasUsableSession;
}
