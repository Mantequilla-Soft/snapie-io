export function normalizeHiveUser(username: string): string {
  return username.trim().toLowerCase();
}

export function createDmConversationId(a: string, b: string): string {
  const users = [normalizeHiveUser(a), normalizeHiveUser(b)].sort();
  return `dm:${users[0]}:${users[1]}`;
}

export function parseDmConversationId(id: string): [string, string] | null {
  if (!id.startsWith('dm:')) return null;
  const parts = id.split(':');
  if (parts.length !== 3) return null;
  const u1 = normalizeHiveUser(parts[1]);
  const u2 = normalizeHiveUser(parts[2]);
  if (!u1 || !u2) return null;
  return [u1, u2];
}

export function isDmParticipant(dmId: string, username: string): boolean {
  const parsed = parseDmConversationId(dmId);
  if (!parsed) return false;
  const normalized = normalizeHiveUser(username);
  return parsed[0] === normalized || parsed[1] === normalized;
}

/** Conversation ids are used as Mongo Map keys (`conversationSeen.<id>`), where
 *  a dot would silently create a nested path instead of one key and a `$` would
 *  be read as an operator — so a read receipt for such an id would never be
 *  stored and its unread count could never clear. Channel ids are caller-chosen
 *  (POST /api/chat/channels), so this is validated at both ends. */
export function isSafeConversationKey(id: string): boolean {
  return typeof id === 'string' && id.length > 0 && !id.includes('.') && !id.includes('$');
}

/** Read-receipt path for a conversation, or null when the id can't hold one. */
export function conversationSeenPath(id: string): string | null {
  return isSafeConversationKey(id) ? `conversationSeen.${id}` : null;
}

export function getDmPeer(dmId: string, username: string): string | null {
  const parsed = parseDmConversationId(dmId);
  if (!parsed) return null;
  const normalized = normalizeHiveUser(username);
  if (parsed[0] === normalized) return parsed[1];
  if (parsed[1] === normalized) return parsed[0];
  return null;
}

