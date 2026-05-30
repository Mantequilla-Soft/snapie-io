import { NextRequest, NextResponse } from 'next/server';
import { withChatAuth } from '@/lib/chat/auth';
import { Channel } from '@/lib/db/models/Channel';
import { ChatUser } from '@/lib/db/models/ChatUser';
import { normalizeHiveUser } from '@/lib/chat/conversations';
import { unsubscribeFromChannel } from '@/lib/chat/fcm';

async function getOwnedGroup(id: string, username: string) {
  const group = await Channel.findById(id);
  if (!group || group.conversationKind !== 'group') return null;
  if (group.owner !== username) return 'forbidden' as const;
  return group;
}

export const POST = withChatAuth(async (req: NextRequest, { username, params }) => {
  const groupId = params?.id;
  if (!groupId) return NextResponse.json({ error: 'Group id missing' }, { status: 400 });
  const owned = await getOwnedGroup(groupId, username);
  if (!owned) return NextResponse.json({ error: 'Group not found' }, { status: 404 });
  if (owned === 'forbidden') return NextResponse.json({ error: 'Only owner can add members' }, { status: 403 });

  const { member } = await req.json();
  if (!member || typeof member !== 'string') {
    return NextResponse.json({ error: 'member required' }, { status: 400 });
  }
  const normalizedMember = normalizeHiveUser(member);
  if (!normalizedMember) return NextResponse.json({ error: 'member required' }, { status: 400 });
  const updated = await Channel.findOneAndUpdate(
    { _id: groupId, members: { $ne: normalizedMember } },
    { $addToSet: { members: normalizedMember }, $inc: { memberCount: 1 } },
    { returnDocument: 'after' }
  );
  if (!updated) return NextResponse.json({ ok: true });
  await ChatUser.updateOne(
    { _id: normalizedMember },
    { $setOnInsert: { _id: normalizedMember }, $addToSet: { channels: groupId } },
    { upsert: true }
  );
  return NextResponse.json({ group: updated });
});

export const DELETE = withChatAuth(async (req: NextRequest, { username, params }) => {
  const groupId = params?.id;
  if (!groupId) return NextResponse.json({ error: 'Group id missing' }, { status: 400 });
  const owned = await getOwnedGroup(groupId, username);
  if (!owned) return NextResponse.json({ error: 'Group not found' }, { status: 404 });
  if (owned === 'forbidden') return NextResponse.json({ error: 'Only owner can remove members' }, { status: 403 });

  const { member } = await req.json();
  if (!member || typeof member !== 'string') {
    return NextResponse.json({ error: 'member required' }, { status: 400 });
  }
  const normalizedMember = normalizeHiveUser(member);
  if (!normalizedMember) return NextResponse.json({ error: 'member required' }, { status: 400 });
  if (normalizedMember === owned.owner) {
    return NextResponse.json({ error: 'Cannot remove owner' }, { status: 400 });
  }

  const updated = await Channel.findOneAndUpdate(
    { _id: groupId, members: normalizedMember },
    { $pull: { members: normalizedMember }, $inc: { memberCount: -1 } },
    { returnDocument: 'after' }
  );
  await Channel.updateOne(
    { _id: groupId, memberCount: { $lt: 1 } },
    { $set: { memberCount: 1 } }
  );
  await ChatUser.updateOne({ _id: normalizedMember }, { $pull: { channels: groupId } });
  const removedUser = await ChatUser.findById(normalizedMember);
  if (removedUser?.fcmTokens?.length) {
    Promise.all(removedUser.fcmTokens.map(t => unsubscribeFromChannel(t, groupId))).catch(() => {});
  }
  return NextResponse.json({ group: updated });
});

