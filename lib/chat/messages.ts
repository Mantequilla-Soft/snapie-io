import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { Message } from '@/lib/db/models/Message';
import { ChatUser } from '@/lib/db/models/ChatUser';
import { conversationSeenPath } from '@/lib/chat/conversations';

const rateLimitMap = new Map<string, number[]>();

export function isRateLimited(username: string): boolean {
  const now = Date.now();
  const windowMs = 10_000;
  const maxMessages = 5;
  const timestamps = (rateLimitMap.get(username) || []).filter(t => now - t < windowMs);
  if (timestamps.length >= maxMessages) return true;
  timestamps.push(now);
  rateLimitMap.set(username, timestamps);
  return false;
}

export function validateMessageBody(content: unknown): { ok: true; value: string } | { ok: false; response: NextResponse } {
  if (!content || typeof content !== 'string') {
    return { ok: false, response: NextResponse.json({ error: 'content required' }, { status: 400 }) };
  }
  const trimmed = content.trim();
  if (trimmed.length === 0) {
    return { ok: false, response: NextResponse.json({ error: 'content required' }, { status: 400 }) };
  }
  if (trimmed.length > 2000) {
    return { ok: false, response: NextResponse.json({ error: 'Message too long' }, { status: 400 }) };
  }
  return { ok: true, value: trimmed };
}

/** Header a client sets to declare it calls POST /api/chat/read itself. */
export const EXPLICIT_READ_HEADER = 'x-snapie-chat-read-mode';

/**
 *  Whether this client manages its own read receipts.
 *
 *  Receipts moved off message GETs and onto an explicit endpoint, but clients
 *  built against the older @snapie/chat-client never call it — for them the
 *  badge would grow forever and their DM "seen" indicator would freeze. So a
 *  GET without this header still stamps a receipt, the way it always did.
 *
 *  This is a compatibility shim, not the design. Delete it (and the legacy
 *  branch in both message GETs) once the consuming apps are on a version of
 *  the SDK that sends the header.
 */
export function usesExplicitReadReceipts(req: { headers: Headers }): boolean {
  return req.headers.get(EXPLICIT_READ_HEADER) === 'explicit';
}

/** Newest createdAt in a page of messages, or null for an empty page. Used as
 *  the legacy receipt floor: stamping what was actually delivered, rather than
 *  `now`, means a message that lands mid-request is not skipped over. */
export function newestCreatedAt(messages: { createdAt: Date }[]): Date | null {
  let newest: Date | null = null;
  for (const msg of messages) {
    if (!msg.createdAt) continue;
    if (!newest || msg.createdAt > newest) newest = msg.createdAt;
  }
  return newest;
}

/** Sender of the message being replied to, denormalized onto the reply so
 *  "someone replied to me" is an indexed field match at unread time. Returns
 *  null for a missing or malformed parent rather than failing the send. */
export async function resolveReplyToSender(
  replyTo: unknown,
  target: string
): Promise<string | null> {
  if (!replyTo || typeof replyTo !== 'string' || !mongoose.isValidObjectId(replyTo)) return null;
  const parent = await Message.findOne({ _id: replyTo, target }).select({ sender: 1 });
  return parent?.sender || null;
}

/** Posting in a conversation means you have read it — without this, the message
 *  you just sent came back as the conversation's own unread message. */
export async function markConversationRead(
  username: string,
  conversationId: string,
  seenAt: Date
): Promise<void> {
  const path = conversationSeenPath(conversationId);
  await ChatUser.updateOne(
    { _id: username },
    { $setOnInsert: { _id: username }, $set: { [path]: seenAt } },
    { upsert: true }
  );
}

