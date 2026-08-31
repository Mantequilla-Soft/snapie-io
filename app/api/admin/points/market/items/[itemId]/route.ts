import { NextResponse } from 'next/server';
import { isValidObjectId } from 'mongoose';
import { withChatAuth } from '@/lib/chat/auth';
import { isAdminUsername } from '@/lib/admin';
import { approveItem, rejectItem } from '@/lib/points/marketService';

export const PATCH = withChatAuth(async (req, { username, params }) => {
  if (!isAdminUsername(username)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const itemId = params?.itemId;
  if (!itemId || !isValidObjectId(itemId)) return NextResponse.json({ error: 'bad_request' }, { status: 400 });

  let body: { decision?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }

  const { decision } = body;
  if (decision !== 'approve' && decision !== 'reject') {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }

  const status = decision === 'approve' ? await approveItem(username, itemId) : await rejectItem(username, itemId);
  return NextResponse.json({ status });
});
