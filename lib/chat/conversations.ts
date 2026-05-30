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

export function getDmPeer(dmId: string, username: string): string | null {
  const parsed = parseDmConversationId(dmId);
  if (!parsed) return null;
  const normalized = normalizeHiveUser(username);
  if (parsed[0] === normalized) return parsed[1];
  if (parsed[1] === normalized) return parsed[0];
  return null;
}

