import { NextResponse } from 'next/server';
import { withChatAuth } from '@/lib/chat/auth';
import { isAdminUsername } from '@/lib/admin';
import { creditPurchase } from '@/lib/points/purchaseService';

export const maxDuration = 20;

// Manual recovery path for a support case: HBD left a user's wallet but the
// automated verify (broadcast -> verifyPointsPurchase) never completed and
// the client-side auto-resume (see lib/points/client.ts) gave up. This just
// re-runs the same creditPurchase() the normal flow uses — it's naturally
// safe to call on an already-credited txid, since PointsLedger's unique
// index makes creditPurchase idempotent either way.
export const POST = withChatAuth(async (req, { username }) => {
  if (!isAdminUsername(username)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: { username?: unknown; txid?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }

  const { username: targetUsername, txid } = body;
  if (typeof targetUsername !== 'string' || !targetUsername || typeof txid !== 'string' || !txid) {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }

  const result = await creditPurchase(targetUsername, txid);
  return NextResponse.json(result);
});
