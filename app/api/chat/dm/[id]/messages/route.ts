import { NextRequest, NextResponse } from 'next/server';
import { withChatAuth } from '@/lib/chat/auth';
import { Message } from '@/lib/db/models/Message';
import { ChatUser } from '@/lib/db/models/ChatUser';
import {
  conversationMapValue,
  conversationSeenAt,
  getDmPeer,
  isDmParticipant,
} from '@/lib/chat/conversations';
import {
  isRateLimited,
  validateMessageBody,
  resolveReplyToSender,
  markConversationRead,
  usesExplicitReadReceipts,
  newestCreatedAt,
} from '@/lib/chat/messages';
import { extractMentions } from '@/lib/chat/mentions';
import { sendDirectMessageToTokens } from '@/lib/chat/fcm';
import mongoose from 'mongoose';

export const GET = withChatAuth(async (req: NextRequest, { username, params }) => {
  const id = params?.id;
  if (!id) return NextResponse.json({ error: 'DM id missing' }, { status: 400 });
  if (!isDmParticipant(id, username)) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const before = searchParams.get('before');
  const after = searchParams.get('after');
  const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 100);

  const me = await ChatUser.findById(username);
  const blocked = new Set<string>([
    ...(me?.blockedUsers || []),
    ...(me?.mutedUsers || []),
  ]);
  const query: Record<string, unknown> = { target: id, type: 'dm' };
  if (before) {
    if (!mongoose.isValidObjectId(before)) {
      return NextResponse.json({ error: 'Invalid before cursor' }, { status: 400 });
    }
    query._id = { $lt: before };
  } else if (after) {
    if (!mongoose.isValidObjectId(after)) {
      return NextResponse.json({ error: 'Invalid after cursor' }, { status: 400 });
    }
    query._id = { $gt: after };
  }
  const sortDirection = after ? 1 : -1;
  const messages = await Message.find(query).sort({ _id: sortDirection }).limit(limit);
  const visible = messages.filter(m => !blocked.has(m.sender));

  const now = Date.now();
  const onlineWindowMs = 2 * 60 * 1000;
  const peer = getDmPeer(id, username);

  // Current clients write the receipt via POST /api/chat/read once the thread
  // is genuinely on screen. Legacy clients don't call it, and here that costs
  // more than a stale badge — the stored receipt is also what the *peer* sees
  // as "seen", so without this their read indicator would freeze permanently.
  // Opening the conversation only; cursor fetches never stamp. Remove with the
  // shim in lib/chat/messages.ts.
  if (!before && !after && !usesExplicitReadReceipts(req)) {
    const floor = newestCreatedAt(messages);
    if (floor) await markConversationRead(username, id, floor);
  }

  let status: {
    meSeenAt: string;
    peerSeenAt: string | null;
    peerLastSeenAt: string | null;
    peerOnline: boolean;
  } | null = null;

  if (peer) {
    const peerUser = await ChatUser.findById(peer);
    const peerSeenAtDate = conversationSeenAt(peerUser, id);
    const peerLastSeenDate = peerUser?.lastSeen || null;
    const peerLastActiveTs = Math.max(
      peerSeenAtDate ? new Date(peerSeenAtDate).getTime() : 0,
      peerLastSeenDate ? new Date(peerLastSeenDate).getTime() : 0
    );
    status = {
      meSeenAt: new Date().toISOString(),
      peerSeenAt: peerSeenAtDate ? new Date(peerSeenAtDate).toISOString() : null,
      peerLastSeenAt: peerLastSeenDate ? new Date(peerLastSeenDate).toISOString() : null,
      peerOnline: !!peerLastActiveTs && (now - peerLastActiveTs) < onlineWindowMs,
    };
  }

  if (after) {
    return NextResponse.json({ messages: visible, status });
  }
  return NextResponse.json({ messages: visible.reverse(), status });
});

export const POST = withChatAuth(async (req, { username, params }) => {
  if (isRateLimited(username)) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
  }
  const id = params?.id;
  if (!id) return NextResponse.json({ error: 'DM id missing' }, { status: 400 });
  if (!isDmParticipant(id, username)) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  const { content, replyTo } = await req.json();
  const validated = validateMessageBody(content);
  if (!validated.ok) return validated.response;

  const peer = getDmPeer(id, username);
  if (!peer) return NextResponse.json({ error: 'Invalid DM' }, { status: 400 });

  const senderUser = await ChatUser.findById(username);
  if (senderUser?.mutedUsers?.includes(peer) || senderUser?.blockedUsers?.includes(peer)) {
    return NextResponse.json({ error: 'Cannot send to muted or blocked user' }, { status: 403 });
  }

  const peerUser = await ChatUser.findById(peer);
  if (peerUser?.blockedUsers?.includes(username)) {
    return NextResponse.json({ error: 'Recipient has blocked you' }, { status: 403 });
  }

  const message = await Message.create({
    type: 'dm',
    target: id,
    sender: username,
    content: validated.value,
    replyTo: replyTo || null,
    mentions: extractMentions(validated.value),
    replyToSender: await resolveReplyToSender(replyTo, id),
  });

  await markConversationRead(username, id, message.createdAt);

  const now = Date.now();
  const cooldownMs = 3 * 60 * 1000;
  const lastMemoAt = conversationMapValue(peerUser?.memoNotifyAt, id)?.getTime() || 0;
  const hasFcm = !!peerUser?.fcmTokens?.length;
  const peerConversationSeenAt = conversationSeenAt(peerUser, id)?.getTime() || 0;
  const peerLastSeenAt = peerUser?.lastSeen ? new Date(peerUser.lastSeen).getTime() : 0;
  const peerLastActiveAt = Math.max(peerConversationSeenAt, peerLastSeenAt);
  const activeWindowMs = 10 * 60 * 1000;
  const peerRecentlyActive = !!peerLastActiveAt && (now - peerLastActiveAt) < activeWindowMs;
  const memoSuggested = !hasFcm && !peerRecentlyActive && (!lastMemoAt || (now - lastMemoAt >= cooldownMs));

  if (peerUser?.fcmTokens?.length) {
    sendDirectMessageToTokens(peerUser.fcmTokens, {
      messageId: message._id.toString(),
      channelId: id,
      sender: username,
      content: validated.value,
    }).catch(() => {});
  }

  return NextResponse.json(
    {
      message,
      delivery: {
        hasFcm,
        memoSuggested,
        cooldownMs,
      }
    },
    { status: 201 }
  );
});

export const PATCH = withChatAuth(async (req, { username, params }) => {
  const id = params?.id;
  if (!id) return NextResponse.json({ error: 'DM id missing' }, { status: 400 });
  if (!isDmParticipant(id, username)) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  const { messageId, content } = await req.json();
  if (!messageId || typeof messageId !== 'string') {
    return NextResponse.json({ error: 'messageId required' }, { status: 400 });
  }
  const validated = validateMessageBody(content);
  if (!validated.ok) return validated.response;

  const message = await Message.findOneAndUpdate(
    { _id: messageId, type: 'dm', target: id, sender: username },
    {
      $set: {
        content: validated.value,
        editedAt: new Date(),
        mentions: extractMentions(validated.value),
      },
    },
    { returnDocument: 'after' }
  );
  if (!message) return NextResponse.json({ error: 'Message not found or not editable' }, { status: 404 });

  return NextResponse.json({ message });
});

