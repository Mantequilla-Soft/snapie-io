import { NextResponse } from 'next/server';
import { withChatAuth } from '@/lib/chat/auth';
import { isPointsAllowedServer } from '@/lib/points/config';
import { awardForAction } from '@/lib/points/awardService';
import { POINTS_ACTION_TYPES, PointsActionType } from '@/lib/points/constants';

// Verification does bounded on-chain retries (~6s), so give the route headroom.
export const maxDuration = 20;

export const POST = withChatAuth(async (req, { username }) => {
  // Authoritative eligibility gate — the client flag is never trusted.
  if (!isPointsAllowedServer(username)) {
    return NextResponse.json({ error: 'not_enrolled' }, { status: 403 });
  }

  let body: { actionType?: unknown; author?: unknown; permlink?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }

  const { actionType, author, permlink } = body;
  if (
    typeof actionType !== 'string' ||
    !POINTS_ACTION_TYPES.includes(actionType as PointsActionType) ||
    typeof author !== 'string' ||
    typeof permlink !== 'string' ||
    !author ||
    !permlink
  ) {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }

  const result = await awardForAction(username, actionType as PointsActionType, author, permlink);
  return NextResponse.json(result);
});
