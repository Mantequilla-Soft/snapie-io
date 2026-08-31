import { NextResponse } from 'next/server';
import { withChatAuth } from '@/lib/chat/auth';
import { ITEM_MARKET_FEATURE_FLAG, passesPointsAllowlist } from '@/lib/points/config';
import { throwItem } from '@/lib/points/marketService';
import { ItemThrowTargetType } from '@/lib/db/models/ItemThrow';

const VALID_TARGET_TYPES: ItemThrowTargetType[] = ['post', 'snap'];

export const POST = withChatAuth(async (req, { username }) => {
  if (!ITEM_MARKET_FEATURE_FLAG || !passesPointsAllowlist(username)) {
    return NextResponse.json({ error: 'not_enrolled' }, { status: 403 });
  }

  let body: { unitId?: unknown; targetAuthor?: unknown; targetPermlink?: unknown; targetType?: unknown; anonymous?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }

  const { unitId, targetAuthor, targetPermlink, targetType, anonymous } = body;
  if (
    typeof unitId !== 'string' || !unitId ||
    typeof targetAuthor !== 'string' || !targetAuthor ||
    typeof targetPermlink !== 'string' || !targetPermlink ||
    typeof targetType !== 'string' || !VALID_TARGET_TYPES.includes(targetType as ItemThrowTargetType) ||
    (anonymous !== undefined && typeof anonymous !== 'boolean')
  ) {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }

  const result = await throwItem(
    username,
    unitId,
    { author: targetAuthor, permlink: targetPermlink, type: targetType as ItemThrowTargetType },
    anonymous === true,
  );
  return NextResponse.json(result);
});
