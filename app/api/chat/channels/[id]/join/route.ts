import { NextResponse } from 'next/server';
import { withChatAuth } from '@/lib/chat/auth';
import { ChatUser } from '@/lib/db/models/ChatUser';
import { Channel } from '@/lib/db/models/Channel';
import { subscribeToChannels } from '@/lib/chat/fcm';

export const POST = withChatAuth(async (_req, { username, params }) => {
  const channelId = params?.id;
  if (!channelId) return NextResponse.json({ error: 'Channel id missing' }, { status: 400 });

  const channel = await Channel.findById(channelId);
  if (!channel) return NextResponse.json({ error: 'Channel not found' }, { status: 404 });
  const memberList = Array.isArray(channel.members) ? channel.members : [];
  if (channel.conversationKind === 'group' && !channel.isPublic && !memberList.includes(username)) {
    return NextResponse.json({ error: 'Invite required' }, { status: 403 });
  }

  const chatUser = await ChatUser.findOneAndUpdate(
    { _id: username },
    { $addToSet: { channels: channelId } },
    { upsert: true, returnDocument: 'after' }
  );

  await Channel.findOneAndUpdate(
    { _id: channelId, members: { $ne: username } },
    { $addToSet: { members: username }, $inc: { memberCount: 1 } }
  );

  // Subscribe all registered devices to this channel's FCM topic
  if (chatUser?.fcmTokens?.length) {
    Promise.all(chatUser.fcmTokens.map(t => subscribeToChannels(t, [channelId]))).catch(() => {});
  }

  return NextResponse.json({ ok: true });
});
