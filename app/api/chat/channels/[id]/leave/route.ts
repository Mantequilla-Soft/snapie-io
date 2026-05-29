import { NextResponse } from 'next/server';
import { withChatAuth } from '@/lib/chat/auth';
import { ChatUser } from '@/lib/db/models/ChatUser';
import { Channel } from '@/lib/db/models/Channel';

export const POST = withChatAuth(async (_req, { username, params }) => {
  const channelId = params?.id;
  if (!channelId) return NextResponse.json({ error: 'Channel id missing' }, { status: 400 });

  await ChatUser.findOneAndUpdate(
    { _id: username },
    { $pull: { channels: channelId } }
  );

  await Channel.findByIdAndUpdate(channelId, { $inc: { memberCount: -1 } });

  return NextResponse.json({ ok: true });
});
