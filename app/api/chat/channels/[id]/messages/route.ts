import { NextRequest, NextResponse } from 'next/server';
import { withChatAuth } from '@/lib/chat/auth';
import { Message } from '@/lib/db/models/Message';
import { Channel } from '@/lib/db/models/Channel';
import { sendChannelMessage } from '@/lib/chat/fcm';
import { ChatUser } from '@/lib/db/models/ChatUser';
import { isRateLimited, validateMessageBody } from '@/lib/chat/messages';

export const GET = withChatAuth(async (req: NextRequest, { username, params }) => {
  const { searchParams } = new URL(req.url);
  const before = searchParams.get('before');
  const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 100);
  const channelId = params?.id;
  if (!channelId) return NextResponse.json({ error: 'Channel id missing' }, { status: 400 });

  const channel = await Channel.findById(channelId);
  if (!channel) return NextResponse.json({ error: 'Channel not found' }, { status: 404 });
  const memberList = Array.isArray(channel.members) ? channel.members : [];
  const isMember = memberList.includes(username);
  if (!channel.isPublic && !isMember) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  if (isMember) {
    await ChatUser.findOneAndUpdate(
      { _id: username },
      { $set: { [`conversationSeen.${channelId}`]: new Date(), lastSeen: new Date() } },
      { upsert: true, returnDocument: 'after' }
    );
  }

  const query: Record<string, unknown> = { target: channelId, type: 'channel' };
  if (before) query._id = { $lt: before };

  const me = await ChatUser.findById(username);
  const blocked = new Set<string>([
    ...(me?.blockedUsers || []),
    ...(me?.mutedUsers || []),
  ]);
  const messages = await Message.find(query).sort({ _id: -1 }).limit(limit);
  const visible = messages.filter(m => !blocked.has(m.sender));
  return NextResponse.json({ messages: visible.reverse() });
});

export const POST = withChatAuth(async (req, { username, params }) => {
  if (isRateLimited(username)) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
  }

  const { content, replyTo } = await req.json();
  const validated = validateMessageBody(content);
  if (!validated.ok) return validated.response;

  const channelId = params?.id;
  if (!channelId) return NextResponse.json({ error: 'Channel id missing' }, { status: 400 });

  const channel = await Channel.findById(channelId);
  if (!channel) return NextResponse.json({ error: 'Channel not found' }, { status: 404 });
  const memberList = Array.isArray(channel.members) ? channel.members : [];
  const isMember = memberList.includes(username);
  if (!channel.isPublic && !isMember) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const message = await Message.create({
    type: 'channel',
    target: channelId,
    sender: username,
    content: validated.value,
    replyTo: replyTo || null,
  });

  // Fire FCM fan-out (no-op if Firebase not configured)
  sendChannelMessage(channelId, {
    messageId: message._id.toString(),
    channelId,
    sender: username,
    content: validated.value,
  }).catch(() => {});

  return NextResponse.json({ message }, { status: 201 });
});
