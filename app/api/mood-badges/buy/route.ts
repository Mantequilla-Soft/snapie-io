import { NextResponse } from 'next/server';
import { withChatAuth } from '@/lib/chat/auth';
import { buyBadge } from '@/lib/moodBadges/service';
import { isMoodBadgeSku } from '@/lib/moodBadges/constants';

export const POST = withChatAuth(async (req, { username }) => {
  let body: { sku?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }

  const { sku } = body;
  if (!isMoodBadgeSku(sku)) {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }

  const result = await buyBadge(username, sku);
  return NextResponse.json(result);
});
