import { NextRequest, NextResponse } from 'next/server';
import { withChatAuth } from '@/lib/chat/auth';
import { ChatUser } from '@/lib/db/models/ChatUser';
import { getDmPeer, isDmParticipant } from '@/lib/chat/conversations';

const memoMarkRateLimit = new Map<string, number[]>();
function isMemoMarkRateLimited(username: string): boolean {
  const now = Date.now();
  const windowMs = 60_000;
  const maxOps = 20;
  const key = `memo-mark:${username}`;
  const timestamps = (memoMarkRateLimit.get(key) || []).filter(t => now - t < windowMs);
  if (timestamps.length >= maxOps) return true;
  timestamps.push(now);
  memoMarkRateLimit.set(key, timestamps);
  return false;
}

export const POST = withChatAuth(async (req: NextRequest, { username, params }) => {
  if (isMemoMarkRateLimited(username)) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
  }
  const id = params?.id;
  if (!id) return NextResponse.json({ error: 'DM id missing' }, { status: 400 });
  if (!isDmParticipant(id, username)) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  const { success } = await req.json();
  if (success !== true) return NextResponse.json({ ok: true });

  const peer = getDmPeer(id, username);
  if (!peer) return NextResponse.json({ error: 'Invalid DM' }, { status: 400 });

  await ChatUser.updateOne(
    { _id: peer },
    { $set: { [`memoNotifyAt.${id}`]: new Date() } },
    { upsert: true }
  );

  return NextResponse.json({ ok: true });
});

