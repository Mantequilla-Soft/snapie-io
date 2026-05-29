import { NextResponse } from 'next/server';
import { withChatAuth } from '@/lib/chat/auth';
import { ChatUser } from '@/lib/db/models/ChatUser';
import { Message } from '@/lib/db/models/Message';

export const GET = withChatAuth(async (_req, { username }) => {
  const chatUser = await ChatUser.findById(username);
  if (!chatUser || chatUser.channels.length === 0) {
    return NextResponse.json({ unread: 0 });
  }

  const lastSeen = chatUser.lastSeen || new Date(0);
  const unread = await Message.countDocuments({
    type: 'channel',
    target: { $in: chatUser.channels },
    createdAt: { $gt: lastSeen },
    sender: { $ne: username },
  });

  return NextResponse.json({ unread });
});
