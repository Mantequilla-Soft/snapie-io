import { NextResponse } from 'next/server';
import { withChatAuth } from '@/lib/chat/auth';
import { ChatUser } from '@/lib/db/models/ChatUser';
import { Channel } from '@/lib/db/models/Channel';
import { Message } from '@/lib/db/models/Message';
import { getDmPeer, parseDmConversationId } from '@/lib/chat/conversations';

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
  const lastMessages = allIds.length > 0
    ? await Message.aggregate([
      { $match: { target: { $in: allIds } } },
      { $sort: { _id: -1 } },
      { $group: { _id: '$target', message: { $first: '$$ROOT' } } },
    ])
    : [];
  const lastMap = new Map(lastMessages.map((row: any) => [row._id, row.message]));

  const conversations = [
    ...channels.map((ch: any) => ({ ...ch.toObject(), type: ch.conversationKind === 'group' ? 'group' : 'channel' })),
    ...dmConversations,
  ].map((conv: any) => ({
    ...conv,
    lastMessage: lastMap.get(conv._id) || null,
    unread: !!(
      lastMap.get(conv._id)?.createdAt &&
      (
        !chatUser?.conversationSeen?.get?.(conv._id) ||
        lastMap.get(conv._id).createdAt > chatUser.conversationSeen.get(conv._id)
      )
    ),
  }));

  conversations.sort((a: any, b: any) => {
    const ta = a.lastMessage?.createdAt ? new Date(a.lastMessage.createdAt).getTime() : 0;
    const tb = b.lastMessage?.createdAt ? new Date(b.lastMessage.createdAt).getTime() : 0;
    return tb - ta;
  });

  return NextResponse.json({ conversations });
});

