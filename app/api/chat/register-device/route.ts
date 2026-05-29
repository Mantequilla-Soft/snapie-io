import { NextRequest, NextResponse } from 'next/server';
import { withChatAuth } from '@/lib/chat/auth';
import { ChatUser } from '@/lib/db/models/ChatUser';

export const POST = withChatAuth(async (req, { username }) => {
  const { fcmToken } = await req.json();
  if (!fcmToken || typeof fcmToken !== 'string') {
    return NextResponse.json({ error: 'fcmToken required' }, { status: 400 });
  }

  await ChatUser.findOneAndUpdate(
    { _id: username },
    { $addToSet: { fcmTokens: fcmToken }, $set: { lastSeen: new Date() } },
    { upsert: true }
  );

  return NextResponse.json({ ok: true });
});
