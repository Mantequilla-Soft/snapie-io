import { NextResponse } from 'next/server';
import { withChatAuth } from '@/lib/chat/auth';
import { ChatUser } from '@/lib/db/models/ChatUser';
import { Channel } from '@/lib/db/models/Channel';
import { subscribeToChannels } from '@/lib/chat/fcm';
import { conversationSeenAt, conversationSeenPath } from '@/lib/chat/conversations';

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

  // Joining starts your history here: without a read receipt at join time, a
  // channel's entire backlog counts as unread the moment you enter it, and
  // there is no honest floor to compare against. Only on a genuinely new join —
  // re-opening a channel you are already in must not silently clear it.
  const alreadySeen = conversationSeenAt(chatUser, channelId);
  const seenPath = conversationSeenPath(channelId);
  if (!alreadySeen) {
    await ChatUser.updateOne({ _id: username }, { $set: { [seenPath]: new Date() } });
  }

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
