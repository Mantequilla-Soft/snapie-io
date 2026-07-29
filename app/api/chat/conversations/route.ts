import { NextResponse } from 'next/server';
import { withChatAuth } from '@/lib/chat/auth';
import { ChatUser } from '@/lib/db/models/ChatUser';
import { Channel } from '@/lib/db/models/Channel';
import { Message } from '@/lib/db/models/Message';
import { getDmPeer, parseDmConversationId } from '@/lib/chat/conversations';
import { computeUnread } from '@/lib/chat/unread';

export const GET = withChatAuth(async (_req, { username }) => {
  const chatUser = await ChatUser.findById(username);
  const ids = chatUser?.channels || [];
  const channelIds = ids.filter((id: string) => !id.startsWith('dm:'));
  const dmIds = ids.filter((id: string) => id.startsWith('dm:'));

  const channels = channelIds.length > 0
    ? await Channel.find({ _id: { $in: channelIds } }).sort({ updatedAt: -1 })
    : [];

  const dmConversations = dmIds
    .map((id: string) => {
      const parsed = parseDmConversationId(id);
      if (!parsed) return null;
      return {
        _id: id,
        type: 'dm' as const,
        isPublic: false,
        members: parsed,
        name: `@${getDmPeer(id, username) || parsed[0]}`,
        peer: getDmPeer(id, username),
      };
    })
    .filter(Boolean);

  const allIds = [...channelIds, ...dmIds];
  // Muted/blocked senders are stripped from the thread, so their text must not
  // surface as a conversation's preview line either.
  const hiddenSenders = Array.from(new Set([
    ...(chatUser?.blockedUsers || []),
    ...(chatUser?.mutedUsers || []),
  ]));
  const lastMessages = allIds.length > 0
    ? await Message.aggregate([
      { $match: { target: { $in: allIds }, sender: { $nin: hiddenSenders } } },
      { $sort: { _id: -1 } },
      { $group: { _id: '$target', message: { $first: '$$ROOT' } } },
    ])
    : [];
  const lastMap = new Map(lastMessages.map((row: any) => [row._id, row.message]));

  // Same counter as the badge, so the dots and the number can never disagree.
  const { byConversation } = await computeUnread(chatUser);

  const conversations = [
    ...channels.map((ch: any) => ({ ...ch.toObject(), type: ch.conversationKind === 'group' ? 'group' : 'channel' })),
    ...dmConversations,
  ].map((conv: any) => ({
    ...conv,
    lastMessage: lastMap.get(conv._id) || null,
    unreadCount: byConversation.get(conv._id) || 0,
    unread: (byConversation.get(conv._id) || 0) > 0,
  }));

  conversations.sort((a: any, b: any) => {
    const ta = a.lastMessage?.createdAt ? new Date(a.lastMessage.createdAt).getTime() : 0;
    const tb = b.lastMessage?.createdAt ? new Date(b.lastMessage.createdAt).getTime() : 0;
    return tb - ta;
  });

  return NextResponse.json({ conversations });
});

