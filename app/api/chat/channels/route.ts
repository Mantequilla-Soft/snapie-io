import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/mongodb';
import { Channel } from '@/lib/db/models/Channel';
import { withChatAuth } from '@/lib/chat/auth';
import { seedDefaultChannels } from '@/lib/chat/seedChannels';

export async function GET() {
  await connectDB();
  await seedDefaultChannels();
  const channels = await Channel.find({ isPublic: true, conversationKind: 'channel' }).sort({ name: 1 });
  return NextResponse.json({ channels });
}

export const POST = withChatAuth(async (req, { username }) => {
  const { id, name, description, type } = await req.json();
  if (!id || !name) return NextResponse.json({ error: 'id and name required' }, { status: 400 });

  const channel = await Channel.findOneAndUpdate(
    { _id: id },
    {
      $setOnInsert: {
        name,
        description,
        type: type || 'community',
        conversationKind: 'channel',
        isPublic: true,
        createdBy: username,
        memberCount: 0,
      }
    },
    { upsert: true, returnDocument: 'after' }
  );
  return NextResponse.json({ channel }, { status: 201 });
});
