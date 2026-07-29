import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/mongodb';
import { Channel } from '@/lib/db/models/Channel';
import { withChatAuth } from '@/lib/chat/auth';
import { seedDefaultChannels } from '@/lib/chat/seedChannels';
import { isSafeConversationKey } from '@/lib/chat/conversations';

// force-dynamic is load-bearing: this GET takes no params and calls no
// dynamic request API, so without it Next statically caches the handler
// itself at build/first-request time and never reruns the Channel.find()
// again in production — a newly created channel would never appear for
// anyone. Same bug and fix as app/api/mood-badges/equipped/route.ts.
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  await connectDB();
  await seedDefaultChannels();
  const channels = await Channel.find({ isPublic: true, conversationKind: 'channel' }).sort({ name: 1 });
  return NextResponse.json({ channels });
}

export const POST = withChatAuth(async (req, { username }) => {
  const { id, name, description, type } = await req.json();
  if (!id || !name) return NextResponse.json({ error: 'id and name required' }, { status: 400 });
  // The id doubles as a Mongo Map key for read receipts, and a dot or '$' there
  // is not storable as a single key — such a channel could never be marked read.
  if (!isSafeConversationKey(id) || id.startsWith('dm:')) {
    return NextResponse.json({ error: 'Invalid channel id' }, { status: 400 });
  }

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
