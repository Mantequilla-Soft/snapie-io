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

/** Read receipts live in a Mongo map keyed by conversation id
 *  (`conversationSeen.<id>`), and an update path cannot carry a `.`, which
 *  addresses a nested field rather than one key, or a `$`, which reads as an
 *  operator. A DM id embeds two Hive usernames and dots are legal in those, so
 *  `dm:rashed.ifte:tibfox` is an ordinary conversation whose receipt was simply
 *  unstorable: every write was rejected, so its unread count could never clear,
 *  and neither could the one for the person on the other side of it. Escaping
 *  those characters makes every id storable as exactly one key.
 *
 *  `~` escapes itself, which keeps the mapping injective. An id containing none
 *  of the three encodes to itself, so receipts written before this existed
 *  still resolve and there is nothing to migrate. */
const SEEN_KEY_ESCAPES: Record<string, string> = { '~': '~7e', '.': '~2e', '$': '~24' };

export function encodeConversationKey(id: string): string {
  return id.replace(/[~.$]/g, (c) => SEEN_KEY_ESCAPES[c]);
}

/** Update path into one of the ChatUser maps keyed by conversation id
 *  (`conversationSeen`, `memoNotifyAt`, `typingAt`). Every id has one. */
export function conversationKeyPath(field: string, id: string): string {
  return `${field}.${encodeConversationKey(id)}`;
}

/** Read-receipt update path for a conversation. */
export function conversationSeenPath(id: string): string {
  return conversationKeyPath('conversationSeen', id);
}

type ConversationMap = { get?(key: string): Date | string | null | undefined } | null | undefined;

/** Timestamp held for a conversation in one of those maps, or null. Reads have
 *  to use the same encoding as the writes above or they miss the key. */
export function conversationMapValue(map: ConversationMap, id: string): Date | null {
  const value = map?.get?.(encodeConversationKey(id));
  return value ? new Date(value) : null;
}

/** When this user last read a conversation, or null if they never have. */
export function conversationSeenAt(
  chatUser: { conversationSeen?: ConversationMap } | null | undefined,
  id: string
): Date | null {
  return conversationMapValue(chatUser?.conversationSeen, id);
}

/** Channel ids are caller-chosen (POST /api/chat/channels) and travel through
 *  URL paths and FCM topic names, so they stay restricted to what is safe
 *  there. DM ids are not caller-chosen: they are built from usernames, and take
 *  whatever Hive allows in one. */
export function isValidChannelId(id: string): boolean {
  return typeof id === 'string' && id.length > 0 && !id.includes('.') && !id.includes('$');
}

export function getDmPeer(dmId: string, username: string): string | null {
  const parsed = parseDmConversationId(dmId);
  if (!parsed) return null;
  const normalized = normalizeHiveUser(username);
  if (parsed[0] === normalized) return parsed[1];
  if (parsed[1] === normalized) return parsed[0];
  return null;
}

