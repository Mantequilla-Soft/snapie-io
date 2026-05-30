import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { withChatAuth } from '@/lib/chat/auth';
import { Channel } from '@/lib/db/models/Channel';
import { ChatUser } from '@/lib/db/models/ChatUser';
import { normalizeHiveUser } from '@/lib/chat/conversations';

export const GET = withChatAuth(async (_req, { username }) => {
  const groups = await Channel.find({
    conversationKind: 'group',
    $or: [{ isPublic: true }, { members: username }],
  }).sort({ updatedAt: -1 });
  return NextResponse.json({ groups });
});

export const POST = withChatAuth(async (req: NextRequest, { username }) => {
  const { name, description, isPublic, members } = await req.json();
  if (!name || typeof name !== 'string') {
    return NextResponse.json({ error: 'name required' }, { status: 400 });
  }

  const normalizedOwner = normalizeHiveUser(username);
  const requestedMembers = Array.isArray(members) ? members.filter((m: unknown) => typeof m === 'string') : [];
  const memberSet = new Set<string>([normalizedOwner, ...requestedMembers.map(normalizeHiveUser)]);
  const groupId = `group-${randomUUID()}`;
  const group = await Channel.create({
    _id: groupId,
    name: name.trim(),
    description: typeof description === 'string' ? description.trim() : '',
    type: 'group',
    conversationKind: 'group',
    createdBy: normalizedOwner,
    owner: normalizedOwner,
    members: Array.from(memberSet),
    memberCount: memberSet.size,
    isPublic: !!isPublic,
  });

  await Promise.all(
    Array.from(memberSet).map(member =>
      ChatUser.updateOne(
        { _id: member },
        { $setOnInsert: { _id: member }, $addToSet: { channels: groupId } },
        { upsert: true }
      )
    )
  );

  return NextResponse.json({ group }, { status: 201 });
});

