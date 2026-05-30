import { NextRequest, NextResponse } from 'next/server';
import { withChatAuth } from '@/lib/chat/auth';
import { Channel } from '@/lib/db/models/Channel';
import { ChatUser } from '@/lib/db/models/ChatUser';
import { normalizeHiveUser } from '@/lib/chat/conversations';

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
  if (owned.members.includes(normalizedMember)) return NextResponse.json({ ok: true });

  const updated = await Channel.findByIdAndUpdate(
    groupId,
    { $addToSet: { members: normalizedMember }, $set: { memberCount: owned.members.length + 1 } },
    { returnDocument: 'after' }
  );
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

  const updated = await Channel.findByIdAndUpdate(
    groupId,
    { $pull: { members: normalizedMember }, $set: { memberCount: Math.max(owned.members.length - 1, 1) } },
    { returnDocument: 'after' }
  );
  await ChatUser.updateOne({ _id: normalizedMember }, { $pull: { channels: groupId } });
  return NextResponse.json({ group: updated });
});

