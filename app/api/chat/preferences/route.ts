import { NextRequest, NextResponse } from 'next/server';
import { withChatAuth } from '@/lib/chat/auth';
import { ChatUser } from '@/lib/db/models/ChatUser';
import { normalizeHiveUser } from '@/lib/chat/conversations';

export const GET = withChatAuth(async (_req, { username }) => {
  const user = await ChatUser.findById(username);
  return NextResponse.json({
    mutedUsers: user?.mutedUsers || [],
    blockedUsers: (user as any)?.blockedUsers || [],
  });
});

export const POST = withChatAuth(async (req: NextRequest, { username }) => {
  const { action, target } = await req.json();
  if (!target || typeof target !== 'string') {
    return NextResponse.json({ error: 'target required' }, { status: 400 });
  }
  if (!action || typeof action !== 'string') {
    return NextResponse.json({ error: 'action required' }, { status: 400 });
  }

  const normalized = normalizeHiveUser(target);
  if (!normalized || normalized === username) {
    return NextResponse.json({ error: 'invalid target' }, { status: 400 });
  }

  if (action === 'mute') {
    await ChatUser.updateOne(
      { _id: username },
      { $setOnInsert: { _id: username }, $addToSet: { mutedUsers: normalized } },
      { upsert: true }
    );
    return NextResponse.json({ ok: true });
  }
  if (action === 'unmute') {
    await ChatUser.updateOne({ _id: username }, { $pull: { mutedUsers: normalized } }, { upsert: true });
    return NextResponse.json({ ok: true });
  }
  if (action === 'block') {
    await ChatUser.updateOne(
      { _id: username },
      { $setOnInsert: { _id: username }, $addToSet: { blockedUsers: normalized }, $pull: { mutedUsers: normalized } },
      { upsert: true }
    );
    return NextResponse.json({ ok: true });
  }
  if (action === 'unblock') {
    await ChatUser.updateOne({ _id: username }, { $pull: { blockedUsers: normalized } }, { upsert: true });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'invalid action' }, { status: 400 });
});

