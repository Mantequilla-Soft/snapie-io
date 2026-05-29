import { NextRequest, NextResponse } from 'next/server';
import { withChatAuth } from '@/lib/chat/auth';
import { Message } from '@/lib/db/models/Message';
import { Channel } from '@/lib/db/models/Channel';
import { sendChannelMessage } from '@/lib/chat/fcm';

// Simple in-memory rate limiter: max 5 messages per 10s per user
const rateLimitMap = new Map<string, number[]>();
function isRateLimited(username: string): boolean {
  const now = Date.now();
  const window = 10_000;
  const maxMessages = 5;
  const timestamps = (rateLimitMap.get(username) || []).filter(t => now - t < window);
  if (timestamps.length >= maxMessages) return true;
  timestamps.push(now);
  rateLimitMap.set(username, timestamps);
  return false;
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const { searchParams } = new URL(req.url);
  const before = searchParams.get('before');
  const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 100);

  const query: Record<string, unknown> = { target: params.id, type: 'channel' };
  if (before) query._id = { $lt: before };

  const messages = await Message.find(query).sort({ _id: -1 }).limit(limit);
  return NextResponse.json({ messages: messages.reverse() });
}

export const POST = withChatAuth(async (req, { username, params }) => {
  if (isRateLimited(username)) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
  }

  const { content, replyTo } = await req.json();
  if (!content || typeof content !== 'string' || content.trim().length === 0) {
    return NextResponse.json({ error: 'content required' }, { status: 400 });
  }
  if (content.length > 2000) {
    return NextResponse.json({ error: 'Message too long' }, { status: 400 });
  }

  const channelId = params?.id;
  if (!channelId) return NextResponse.json({ error: 'Channel id missing' }, { status: 400 });

  const channel = await Channel.findById(channelId);
  if (!channel) return NextResponse.json({ error: 'Channel not found' }, { status: 404 });

  const message = await Message.create({
    type: 'channel',
    target: channelId,
    sender: username,
    content: content.trim(),
    replyTo: replyTo || null,
  });

  // Fire FCM fan-out (no-op if Firebase not configured)
  sendChannelMessage(channelId, {
    messageId: message._id.toString(),
    channelId,
    sender: username,
    content: content.trim(),
  }).catch(() => {});

  return NextResponse.json({ message }, { status: 201 });
});
