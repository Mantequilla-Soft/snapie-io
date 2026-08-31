import { NextResponse } from 'next/server';
import { isValidObjectId } from 'mongoose';
import { withChatAuth } from '@/lib/chat/auth';
import { ITEM_MARKET_FEATURE_FLAG } from '@/lib/points/config';
import { passesPointsAllowlist } from '@/lib/points/config';
import { buyItem } from '@/lib/points/marketService';

export const POST = withChatAuth(async (req, { username, params }) => {
  // Authoritative eligibility, same rollout gate as Points Roulette — the
  // client's flag check is never trusted.
  if (!ITEM_MARKET_FEATURE_FLAG || !passesPointsAllowlist(username)) {
    return NextResponse.json({ error: 'not_enrolled' }, { status: 403 });
  }

  const itemId = params?.itemId;
  if (!itemId || !isValidObjectId(itemId)) return NextResponse.json({ error: 'bad_request' }, { status: 400 });

  let body: { purchaseRefKey?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }

  const { purchaseRefKey } = body;
  if (typeof purchaseRefKey !== 'string' || !purchaseRefKey) {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }

  const result = await buyItem(username, itemId, purchaseRefKey);
  return NextResponse.json(result);
});
