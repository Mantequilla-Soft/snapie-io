import { NextRequest, NextResponse } from 'next/server';
import { withChatAuth } from '@/lib/chat/auth';
import { Message } from '@/lib/db/models/Message';
import { Channel } from '@/lib/db/models/Channel';
import { sendChannelMessage, sendChannelMessageToTokens } from '@/lib/chat/fcm';
import { ChatUser } from '@/lib/db/models/ChatUser';
import {
  isRateLimited,
  validateMessageBody,
  resolveReplyToSender,
  markConversationRead,
  usesExplicitReadReceipts,
  newestCreatedAt,
} from '@/lib/chat/messages';
import { extractMentions } from '@/lib/chat/mentions';
import mongoose from 'mongoose';

export const GET = withChatAuth(async (req: NextRequest, { username, params }) => {
  const { searchParams } = new URL(req.url);
  const before = searchParams.get('before');
  const after = searchParams.get('after');
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

  // Fetching is not reading — a background poll behind a minimized panel used
  // to clear the badge for messages nobody looked at, so current clients call
  // POST /api/chat/read instead and set the header that suppresses the legacy
  // stamp below.
  const query: Record<string, unknown> = { target: channelId, type: 'channel' };
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

  const me = await ChatUser.findById(username);
  const blocked = new Set<string>([
    ...(me?.blockedUsers || []),
    ...(me?.mutedUsers || []),
  ]);
  const sortDirection = after ? 1 : -1;
  const messages = await Message.find(query).sort({ _id: sortDirection }).limit(limit);
  const visible = messages.filter(m => !blocked.has(m.sender));

  // Legacy clients only: opening a conversation is the one fetch that really
  // does mean "read", so the shim is limited to it. Cursor fetches — the
  // background `after` poll and `before` scrollback — never stamp, which is
  // what made the old behaviour wrong. Remove with the shim.
  if (isMember && !before && !after && !usesExplicitReadReceipts(req)) {
    const floor = newestCreatedAt(messages);
    if (floor) await markConversationRead(username, channelId, floor);
  }

  if (after) {
    return NextResponse.json({ messages: visible });
  }
  return NextResponse.json({ messages: visible.reverse() });
});

/** Push a public-channel message only to the members it mentions or replies to,
 *  skipping anyone who muted or blocked the sender — they would never see the
 *  message in the thread, so they must not be pinged about it either. */
async function notifyAddressedMembers(
  channelId: string,
  sender: string,
  mentions: string[],
  replyToSender: string | null,
  payload: { messageId: string; channelId: string; sender: string; content: string }
): Promise<void> {
  const targets = Array.from(new Set([...mentions, ...(replyToSender ? [replyToSender] : [])]))
    .filter(name => name !== sender);
  if (!targets.length) return;

  const recipients = await ChatUser.find({
    _id: { $in: targets },
    channels: channelId,
    fcmTokens: { $exists: true, $ne: [] },
    blockedUsers: { $ne: sender },
    mutedUsers: { $ne: sender },
  }).select({ fcmTokens: 1 });

  const tokens = recipients.flatMap(r => r.fcmTokens || []);
  await sendChannelMessageToTokens(tokens, payload);
}

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

  const mentions = extractMentions(validated.value);
  const replyToSender = await resolveReplyToSender(replyTo, channelId);

  const message = await Message.create({
    type: 'channel',
    target: channelId,
    sender: username,
    content: validated.value,
    replyTo: replyTo || null,
    mentions,
    replyToSender,
  });

  await markConversationRead(username, channelId, message.createdAt);

  // Push follows the same rule as the badge (lib/chat/unread.ts): a private
  // group interrupts everyone, a public channel only the people the message is
  // addressed to. Fanning the topic out on every message was why #general
  // notified the whole room. No-op if Firebase is not configured.
  const payload = {
    messageId: message._id.toString(),
    channelId,
    sender: username,
    content: validated.value,
  };
  if (channel.conversationKind === 'group' && !channel.isPublic) {
    sendChannelMessage(channelId, payload).catch(() => {});
  } else {
    notifyAddressedMembers(channelId, username, mentions, replyToSender, payload).catch(() => {});
  }

  return NextResponse.json({ message }, { status: 201 });
});

export const PATCH = withChatAuth(async (req, { username, params }) => {
  const channelId = params?.id;
  if (!channelId) return NextResponse.json({ error: 'Channel id missing' }, { status: 400 });

  const { messageId, content } = await req.json();
  if (!messageId || typeof messageId !== 'string' || !mongoose.isValidObjectId(messageId)) {
    return NextResponse.json({ error: 'Valid messageId required' }, { status: 400 });
  }

  const validated = validateMessageBody(content);
  if (!validated.ok) return validated.response;

  const channel = await Channel.findById(channelId);
  if (!channel) return NextResponse.json({ error: 'Channel not found' }, { status: 404 });
  const memberList = Array.isArray(channel.members) ? channel.members : [];
  const isMember = memberList.includes(username);
  if (!channel.isPublic && !isMember) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const message = await Message.findOneAndUpdate(
    { _id: messageId, type: 'channel', target: channelId, sender: username },
    {
      $set: {
        content: validated.value,
        editedAt: new Date(),
        // Editing someone into (or out of) a message has to move the mention
        // with it, or the stored list drifts from the text it describes.
        mentions: extractMentions(validated.value),
      },
    },
    { returnDocument: 'after' }
  );

  if (!message) return NextResponse.json({ error: 'Message not found or not editable' }, { status: 404 });
  return NextResponse.json({ message });
});
