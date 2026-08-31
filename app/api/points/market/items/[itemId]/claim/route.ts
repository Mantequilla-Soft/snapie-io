import { NextResponse } from 'next/server';
import { isValidObjectId } from 'mongoose';
import { withChatAuth } from '@/lib/chat/auth';
import { ITEM_MARKET_FEATURE_FLAG, passesPointsAllowlist } from '@/lib/points/config';
import { claimOwnItem } from '@/lib/points/marketService';

// Free unit for the creator of their own item — see claimOwnItem's doc
// comment in marketService.ts for why this is deliberately not a purchase.
export const POST = withChatAuth(async (_req, { username, params }) => {
  if (!ITEM_MARKET_FEATURE_FLAG || !passesPointsAllowlist(username)) {
    return NextResponse.json({ error: 'not_enrolled' }, { status: 403 });
  }

  const itemId = params?.itemId;
  if (!itemId || !isValidObjectId(itemId)) return NextResponse.json({ error: 'bad_request' }, { status: 400 });

  const result = await claimOwnItem(username, itemId);
  return NextResponse.json(result);
});
