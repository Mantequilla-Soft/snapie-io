import { NextResponse } from 'next/server';
import { withChatAuth } from '@/lib/chat/auth';
import { ChatUser } from '@/lib/db/models/ChatUser';
import { computeUnread, unreadToJSON } from '@/lib/chat/unread';

/** Badge count. `unread` is a message total (not a conversation total as it was
 *  before), and `conversations` breaks it down so the panel's per-conversation
 *  dots are guaranteed to add up to the badge — see lib/chat/unread.ts. */
export const GET = withChatAuth(async (_req, { username }) => {
  const chatUser = await ChatUser.findById(username);
  return NextResponse.json(unreadToJSON(await computeUnread(chatUser)));
});
