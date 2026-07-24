// Minimal allowlist-based admin check. Deliberately keyed off the Hive
// username already verified by withChatAuth's signature check (works for
// both custodial and wallet-signed users), not the custodial-only
// SnapieUser.isAdmin flag from the separate auth backend, which wouldn't
// cover a wallet-based admin at all.
function adminUsernames(): Set<string> {
  return new Set(
    (process.env.ADMIN_HIVE_USERNAMES ?? '')
      .split(',')
      .map(u => u.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function isAdminUsername(username: string): boolean {
  return adminUsernames().has(username.trim().toLowerCase());
}
