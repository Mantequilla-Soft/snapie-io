import { NextResponse } from 'next/server';
import { withChatAuth } from '@/lib/chat/auth';
import { ChatUser } from '@/lib/db/models/ChatUser';
import { Message } from '@/lib/db/models/Message';

export const GET = withChatAuth(async (_req, { username }) => {
  const chatUser = await ChatUser.findById(username);
  if (!chatUser) {
    return NextResponse.json({ unread: 0 });
  }

  const channelIds = chatUser.channels || [];
  let unread = 0;

  if (channelIds.length > 0) {
    const channels = await Message.aggregate([
      {
        $match: {
          type: 'channel',
          target: { $in: channelIds },
          sender: { $ne: username },
        }
      },
      { $group: { _id: '$target', lastCreatedAt: { $max: '$createdAt' } } },
    ]);

    for (const row of channels) {
      const seenAt = chatUser.conversationSeen?.[row._id] || chatUser.lastSeen || new Date(0);
      if (row.lastCreatedAt > seenAt) unread += 1;
    }
  }

  const dms = await Message.aggregate([
    {
      $match: {
        type: 'dm',
        sender: { $ne: username },
        target: { $regex: `^dm:.*${username}.*$` },
      }
    },
    { $group: { _id: '$target', lastCreatedAt: { $max: '$createdAt' } } },
  ]);

  for (const row of dms) {
    const seenAt = chatUser.conversationSeen?.[row._id] || new Date(0);
    if (row.lastCreatedAt > seenAt) unread += 1;
  }

  return NextResponse.json({ unread });
});
