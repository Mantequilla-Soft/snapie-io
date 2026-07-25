import { NextResponse } from 'next/server';
import { withChatAuth } from '@/lib/chat/auth';
import { getMyBadges } from '@/lib/moodBadges/service';

export const GET = withChatAuth(async (_req, { username }) => {
  const badges = await getMyBadges(username);
  return NextResponse.json(badges);
});
