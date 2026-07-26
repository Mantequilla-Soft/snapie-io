import { NextResponse } from 'next/server';
import { withChatAuth } from '@/lib/chat/auth';
import { isAdminUsername } from '@/lib/admin';
import { grantPoints } from '@/lib/points/adminGrantService';
import { ChatUser } from '@/lib/db/models/ChatUser';
import { sendGenericNotificationToTokens } from '@/lib/chat/fcm';

export const maxDuration = 20;

// The "points cannon" — lets an allowlisted admin manually credit a user's
// balance, e.g. as a customer-service comp. See grantPoints for why this is
// balance-only (never lifetimeEarned) and how the idempotency key keeps a
// double-click from double-granting.
export const POST = withChatAuth(async (req, { username }) => {
  if (!isAdminUsername(username)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: { username?: unknown; points?: unknown; reason?: unknown; idempotencyKey?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }

  const { username: targetUsername, points, reason, idempotencyKey } = body;
  if (
    typeof targetUsername !== 'string' || !targetUsername.trim() ||
    typeof points !== 'number' ||
    typeof idempotencyKey !== 'string' || !idempotencyKey.trim() ||
    (reason !== undefined && typeof reason !== 'string')
  ) {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }

  const trimmedReason = typeof reason === 'string' ? reason.trim().slice(0, 280) || undefined : undefined;

  const target = targetUsername.trim().toLowerCase();
  const result = await grantPoints(username, target, points, trimmedReason, idempotencyKey.trim());

  // Best-effort push — same non-blocking, errors-swallowed shape as the
  // chat DM send this reuses. A user with push never enabled (no
  // fcmTokens) just doesn't get one; that's an existing, accepted gap in
  // the chat notifications this borrows from, not a new failure mode.
  if (result.status === 'granted') {
    ChatUser.findById(target).lean().then(peer => {
      if (peer?.fcmTokens?.length) {
        sendGenericNotificationToTokens(peer.fcmTokens, {
          title: '🎁 You got Snapie Points!',
          body: trimmedReason ? `+${result.pointsGranted.toLocaleString()} points — ${trimmedReason}` : `+${result.pointsGranted.toLocaleString()} points`,
          tag: 'points-grant',
          link: '/settings',
        }).catch(() => {});
      }
    }).catch(() => {});
  }

  return NextResponse.json(result);
});
