import { NextResponse } from 'next/server';
import { withChatAuth } from '@/lib/chat/auth';
import { creditPurchase } from '@/lib/points/purchaseService';

// Verification does bounded on-chain retries (~6s), same as the award route.
export const maxDuration = 20;

export const POST = withChatAuth(async (req, { username }) => {
  let body: { txid?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }

  const { txid } = body;
  if (typeof txid !== 'string' || !txid) {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }

  const result = await creditPurchase(username, txid);
  return NextResponse.json(result);
});
