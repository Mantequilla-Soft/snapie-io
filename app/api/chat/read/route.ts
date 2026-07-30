import { NextRequest, NextResponse } from 'next/server';
import { withChatAuth } from '@/lib/chat/auth';
import { ChatUser } from '@/lib/db/models/ChatUser';
import { Message } from '@/lib/db/models/Message';
import { conversationSeenPath, isDmParticipant } from '@/lib/chat/conversations';
import { computeUnread, unreadToJSON } from '@/lib/chat/unread';

/**
 *  Explicit "I have read this conversation".
 *
 *  Read receipts used to be a side effect of GET-ing messages, which meant they
 *  recorded when the client last *polled* rather than what the user actually
 *  looked at: a background poll for a minimized panel marked everything read,
 *  and a message that landed between the receipt write and the query stayed
 *  unread even though it had just been delivered. The client now says so
 *  explicitly, when a conversation is on screen.
 *
 *  Stamps the newest message's createdAt rather than `now` so nothing that
 *  arrives mid-request is skipped over.
 */
export const POST = withChatAuth(async (req: NextRequest, { username }) => {
  const { conversationId } = await req.json().catch(() => ({ conversationId: null }));
  if (!conversationId || typeof conversationId !== 'string') {
    return NextResponse.json({ error: 'conversationId required' }, { status: 400 });
  }

  const path = conversationSeenPath(conversationId);

  const isDm = conversationId.startsWith('dm:');
  if (isDm && !isDmParticipant(conversationId, username)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const chatUser = await ChatUser.findById(username);
  if (!isDm && !chatUser?.channels?.includes(conversationId)) {
    // Not a member — nothing was ever counted for it, so nothing to clear.
    return NextResponse.json({ ...unreadToJSON(await computeUnread(chatUser)) });
  }

  const newest = await Message.findOne({ target: conversationId })
    .sort({ _id: -1 })
    .select({ createdAt: 1 });
  const seenAt = newest?.createdAt ? new Date(newest.createdAt) : new Date();

  const updated = await ChatUser.findOneAndUpdate(
    { _id: username },
    { $set: { [path]: seenAt } },
    { upsert: true, returnDocument: 'after' }
  );

  return NextResponse.json(unreadToJSON(await computeUnread(updated)));
});
