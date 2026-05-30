import { NextRequest, NextResponse } from 'next/server';
import { withChatAuth } from '@/lib/chat/auth';
import { ChatUser } from '@/lib/db/models/ChatUser';
import { subscribeToChannels } from '@/lib/chat/fcm';

export const POST = withChatAuth(async (req, { username }) => {
  const { fcmToken } = await req.json();
  if (!fcmToken || typeof fcmToken !== 'string') {
    return NextResponse.json({ error: 'fcmToken required' }, { status: 400 });
  }

  const chatUser = await ChatUser.findOneAndUpdate(
    { _id: username },
    { $addToSet: { fcmTokens: fcmToken }, $set: { lastSeen: new Date() } },
    { upsert: true, returnDocument: 'after' }
  );

  // Subscribe this token to all channels the user has joined
  if (chatUser?.channels?.length) {
    subscribeToChannels(fcmToken, chatUser.channels).catch(() => {});
  }

  return NextResponse.json({ ok: true });
});
