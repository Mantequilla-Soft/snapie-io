import { NextResponse } from 'next/server';
import { withChatAuth } from '@/lib/chat/auth';
import { getInventory } from '@/lib/points/marketService';

export const GET = withChatAuth(async (_req, { username }) => {
  const inventory = await getInventory(username);
  return NextResponse.json({ inventory });
});
