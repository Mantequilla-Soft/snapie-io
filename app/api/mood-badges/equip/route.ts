import { NextResponse } from 'next/server';
import { withChatAuth } from '@/lib/chat/auth';
import { equipBadge } from '@/lib/moodBadges/service';
import { isMoodBadgeSku } from '@/lib/moodBadges/constants';

export const POST = withChatAuth(async (req, { username }) => {
  let body: { sku?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }

  const { sku } = body;
  if (sku !== null && !isMoodBadgeSku(sku)) {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }

  const result = await equipBadge(username, sku);
  return NextResponse.json(result);
});
