import { NextResponse } from 'next/server';
import { withChatAuth } from '@/lib/chat/auth';
import { ChatUser } from '@/lib/db/models/ChatUser';
import { createDmConversationId, normalizeHiveUser } from '@/lib/chat/conversations';
import { currentChatId } from '@/lib/chat/graduation';
import { isWarmupChatId } from '@/lib/chat/butrauth';

export const POST = withChatAuth(async (req, { username }) => {
  const { targetUser } = await req.json();
  if (!targetUser || typeof targetUser !== 'string') {
    return NextResponse.json({ error: 'targetUser required' }, { status: 400 });
  }

  const me = normalizeHiveUser(username);
  // A warm-up id that has since graduated lives on under its Hive name; a DM
  // opened to the old id would land in an inbox nobody reads any more.
  const peer = await currentChatId(normalizeHiveUser(targetUser));
  if (!peer) return NextResponse.json({ error: 'targetUser required' }, { status: 400 });
  if (peer === me) return NextResponse.json({ error: 'Cannot DM yourself' }, { status: 400 });

  const id = createDmConversationId(me, peer);
  await ChatUser.updateOne({ _id: me }, { $setOnInsert: { _id: me }, $addToSet: { channels: id } }, { upsert: true });
  await ChatUser.updateOne({ _id: peer }, { $setOnInsert: { _id: peer }, $addToSet: { channels: id } }, { upsert: true });

  const peerDisplayName = isWarmupChatId(peer)
    ? (await ChatUser.findById(peer, { displayName: 1 }).lean<{ displayName?: string | null }>())?.displayName || null
    : null;

  return NextResponse.json({
    conversation: {
      _id: id,
      name: `@${peerDisplayName || peer}`,
      peer,
      peerDisplayName,
      type: 'dm',
      isPublic: false,
      members: [me, peer],
    }
  });
});

