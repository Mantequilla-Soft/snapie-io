import { NextRequest, NextResponse } from 'next/server';
import { withChatAuth } from '@/lib/chat/auth';
import { ChatUser } from '@/lib/db/models/ChatUser';
import { Channel } from '@/lib/db/models/Channel';
import { isDmParticipant } from '@/lib/chat/conversations';

const TYPING_TTL_MS = 6000;
const TYPING_CLEANUP_MS = 5 * 60 * 1000;

function isConversationIdValid(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export const POST = withChatAuth(async (req: NextRequest, { username }) => {
  const { conversationId, isTyping } = await req.json().catch(() => ({}));
  if (!isConversationIdValid(conversationId)) {
    return NextResponse.json({ error: 'conversationId required' }, { status: 400 });
  }
  const convId = conversationId.trim();
  if (typeof isTyping !== 'boolean') {
    return NextResponse.json({ error: 'isTyping boolean required' }, { status: 400 });
  }

  if (convId.startsWith('dm:')) {
    if (!isDmParticipant(convId, username)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }
  } else {
    const channel = await Channel.findById(convId).lean();
    if (!channel) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    const memberList = Array.isArray(channel.members) ? channel.members : [];
    if (!channel.isPublic && !memberList.includes(username)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }
  }

  if (isTyping) {
    await ChatUser.findOneAndUpdate(
      { _id: username },
      { $set: { [`typingAt.${convId}`]: new Date() } },
      { upsert: true, returnDocument: 'after' }
    );
  } else {
    await ChatUser.findOneAndUpdate(
      { _id: username },
      { $unset: { [`typingAt.${convId}`]: 1 } },
      { upsert: true, returnDocument: 'after' }
    );
  }

  return NextResponse.json({ ok: true });
});

export const GET = withChatAuth(async (req: NextRequest, { username }) => {
  const { searchParams } = new URL(req.url);
  const conversationId = searchParams.get('conversationId');
  if (!isConversationIdValid(conversationId)) {
    return NextResponse.json({ error: 'conversationId required' }, { status: 400 });
  }
  const convId = conversationId.trim();

  if (convId.startsWith('dm:')) {
    if (!isDmParticipant(convId, username)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }
  } else {
    const channel = await Channel.findById(convId).lean();
    if (!channel) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    const memberList = Array.isArray(channel.members) ? channel.members : [];
    if (!channel.isPublic && !memberList.includes(username)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }
  }

  const users = await ChatUser.find(
    { _id: { $ne: username }, [`typingAt.${convId}`]: { $exists: true } },
    { _id: 1, typingAt: 1 }
  ).lean();

  const now = Date.now();
  const typingUsers: string[] = [];
  const staleUsers: string[] = [];

  for (const u of users) {
    const rawMap = u.typingAt as unknown as Record<string, string | Date> | undefined;
    const ts = rawMap?.[convId];
    if (!ts) continue;
    const age = now - new Date(ts).getTime();
    if (age <= TYPING_TTL_MS) typingUsers.push(String(u._id));
    if (age > TYPING_CLEANUP_MS) staleUsers.push(String(u._id));
  }

  if (staleUsers.length > 0) {
    await ChatUser.updateMany(
      { _id: { $in: staleUsers } },
      { $unset: { [`typingAt.${convId}`]: 1 } }
    );
  }

  return NextResponse.json({ users: typingUsers, ttlMs: TYPING_TTL_MS });
});
