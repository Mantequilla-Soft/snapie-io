import { NextResponse } from 'next/server';
import { withChatAuth } from '@/lib/chat/auth';
import { ChatUser } from '@/lib/db/models/ChatUser';
import { Channel } from '@/lib/db/models/Channel';
import { unsubscribeFromChannel } from '@/lib/chat/fcm';

export const POST = withChatAuth(async (_req, { username, params }) => {
  const channelId = params?.id;
  if (!channelId) return NextResponse.json({ error: 'Channel id missing' }, { status: 400 });

  const channel = await Channel.findById(channelId);
  if (!channel) return NextResponse.json({ error: 'Channel not found' }, { status: 404 });
  if (channel.conversationKind === 'group' && channel.owner === username) {
    return NextResponse.json({ error: 'Owner cannot leave group' }, { status: 400 });
  }

  const chatUser = await ChatUser.findOneAndUpdate(
    { _id: username },
    { $pull: { channels: channelId } },
    { returnDocument: 'before' }
  );

  const memberList = Array.isArray(channel.members) ? channel.members : [];
  const wasMember = memberList.includes(username);
  if (wasMember) {
    await Channel.findByIdAndUpdate(
      channelId,
      {
        $pull: { members: username },
        $set: { memberCount: Math.max((channel.memberCount || 1) - 1, 0) }
      }
    );
  }

  // Unsubscribe all registered devices from this channel's FCM topic
  if (chatUser?.fcmTokens?.length) {
    Promise.all(chatUser.fcmTokens.map(t => unsubscribeFromChannel(t, channelId))).catch(() => {});
  }

  return NextResponse.json({ ok: true });
});
