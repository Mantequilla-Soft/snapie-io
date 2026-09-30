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
 * expiry, a different Hive account, or a session the server rejected.
 * A logged-out Hive user sees "log in" even if a token is still stored, so
 * logout does not leave a live composer behind.
 */
export function shouldShowChatAuthGate(
  hiveUsername: string | null | undefined,
  hasUsableSession: boolean,
): boolean {
  return !hiveUsername || !hasUsableSession;
}
