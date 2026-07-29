import type { IChatUser } from '@/lib/db/models/ChatUser';
import { Message } from '@/lib/db/models/Message';
import { Channel } from '@/lib/db/models/Channel';

/**
 *  The single definition of "unread" for chat. Both the badge (/api/chat/unread)
 *  and the per-conversation dot (/api/chat/conversations) call this, because
 *  when they each had their own copy they disagreed — one counted your own
 *  messages, the other didn't; one fell back to `lastSeen` (which every
 *  authenticated request rewrites to now, so it meant nothing), the other
 *  treated "never opened" as unread. The badge could not be reconciled against
 *  anything on screen.
 *
 *  Rules, in one place:
 *   - A DM, or a private (invite-only) group, is unread for any message someone
 *     else sent after you last read it. Someone put you in that room by name.
 *   - A public channel — and a public group — is unread only when a message
 *     mentions you or replies to something you wrote. Ambient chatter in
 *     #general does not badge.
 *   - Your own messages never count, and neither do messages from anyone you
 *     muted or blocked — those are filtered out of the message list too, so
 *     counting them produced a badge with nothing behind it.
 */

export interface UnreadSummary {
  /** conversationId -> unread message count. Only conversations with > 0. */
  byConversation: Map<string, number>;
  /** Total unread messages across all conversations. */
  total: number;
}

function seenAtFor(chatUser: IChatUser, conversationId: string): Date | null {
  const seen = chatUser.conversationSeen?.get?.(conversationId);
  return seen ? new Date(seen) : null;
}

export async function computeUnread(chatUser: IChatUser | null): Promise<UnreadSummary> {
  if (!chatUser) return { byConversation: new Map(), total: 0 };

  const username = chatUser._id;
  const ids = chatUser.channels || [];
  if (ids.length === 0) return { byConversation: new Map(), total: 0 };

  // Muted/blocked senders are invisible in the thread (both message GETs strip
  // them), so they must be invisible to the counter as well.
  const ignoredSenders = Array.from(new Set([
    username,
    ...(chatUser.blockedUsers || []),
    ...(chatUser.mutedUsers || []),
  ]));

  // Private groups notify on every message like a DM; public rooms only on
  // messages addressed to you.
  const channelIds = ids.filter(id => !id.startsWith('dm:'));
  const notifyAll = new Set<string>();
  if (channelIds.length > 0) {
    const rooms = await Channel.find(
      { _id: { $in: channelIds }, conversationKind: 'group', isPublic: false },
    ).select({ _id: 1 }).lean();
    for (const room of rooms) notifyAll.add(String(room._id));
  }

  // One $or branch per conversation: each carries its own "since I last read
  // it" cursor, and public rooms additionally require the message to be
  // addressed to this user.
  const branches: Record<string, unknown>[] = [];
  for (const id of ids) {
    const seenAt = seenAtFor(chatUser, id);
    const isDm = id.startsWith('dm:');
    const branch: Record<string, unknown> = {
      target: id,
      type: isDm ? 'dm' : 'channel',
    };
    if (seenAt) branch.createdAt = { $gt: seenAt };
    if (!isDm && !notifyAll.has(id)) {
      branch.$or = [{ mentions: username }, { replyToSender: username }];
    }
    branches.push(branch);
  }

  const rows = await Message.aggregate<{ _id: string; count: number }>([
    { $match: { $or: branches, sender: { $nin: ignoredSenders } } },
    { $group: { _id: '$target', count: { $sum: 1 } } },
  ]);

  const byConversation = new Map<string, number>();
  let total = 0;
  for (const row of rows) {
    if (!row.count) continue;
    byConversation.set(row._id, row.count);
    total += row.count;
  }

  return { byConversation, total };
}

/** Serializable form for API responses. */
export function unreadToJSON(summary: UnreadSummary): {
  unread: number;
  conversations: Record<string, number>;
} {
  return {
    unread: summary.total,
    conversations: Object.fromEntries(summary.byConversation),
  };
}
