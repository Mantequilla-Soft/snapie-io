import { NextResponse } from 'next/server';
import { withChatAuth } from '@/lib/chat/auth';
import { ChatUser } from '@/lib/db/models/ChatUser';
import { isWarmupChatId } from '@/lib/chat/butrauth';

const MAX_IDS = 100;

/**
 * GET /api/chat/users?ids=a,b,...
 *
 * How to show a chat id. Hive names show as themselves; a warm-up id (`~...`)
 * shows its handle, and once graduated points at the account it became. Lets a
 * client render senders in a channel or group, where the conversation list does
 * not carry names. Signed-in only, and it reveals nothing beyond the name a
 * person already shows in every conversation they are part of.
 */
export const GET = withChatAuth(async (req) => {
  const raw = new URL(req.url).searchParams.get('ids') || '';
  const ids = Array.from(new Set(raw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean))).slice(0, MAX_IDS);
  const warm = ids.filter(isWarmupChatId);
  const rows = warm.length
    ? await ChatUser.find({ _id: { $in: warm } }, { displayName: 1, mergedInto: 1 })
      .lean<{ _id: string; displayName?: string | null; mergedInto?: string | null }[]>()
    : [];
  const byId = new Map(rows.map((r) => [r._id, r]));
  const users = ids.map((id) => {
    if (!isWarmupChatId(id)) return { id, displayName: id, warmup: false, mergedInto: null };
    const r = byId.get(id);
    return { id, displayName: r?.displayName || null, warmup: true, mergedInto: r?.mergedInto || null };
  });
  return NextResponse.json({ users });
});
