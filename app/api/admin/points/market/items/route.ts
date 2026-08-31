import { NextResponse } from 'next/server';
import { withChatAuth } from '@/lib/chat/auth';
import { isAdminUsername } from '@/lib/admin';
import { adminCreateItem, listPendingItems } from '@/lib/points/marketService';
import { ITEM_MIN_PRICE } from '@/lib/points/marketConfig';

// The Phase 1 review queue: every item awaiting approval.
export const GET = withChatAuth(async (_req, { username }) => {
  if (!isAdminUsername(username)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const items = await listPendingItems();
  return NextResponse.json({ items });
});

// Kept alongside the review queue above as a shortcut for quickly
// seeding/curating the catalog without going through review — this is what
// Phase 0 used exclusively, before public creation existed.
export const POST = withChatAuth(async (req, { username }) => {
  if (!isAdminUsername(username)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: { creatorUsername?: unknown; name?: unknown; description?: unknown; imageUrl?: unknown; price?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }

  const { creatorUsername, name, description, imageUrl, price } = body;
  if (
    typeof creatorUsername !== 'string' || !creatorUsername.trim() ||
    typeof name !== 'string' || !name.trim() ||
    typeof description !== 'string' || !description.trim() ||
    typeof imageUrl !== 'string' || !imageUrl.trim() ||
    typeof price !== 'number' || !Number.isFinite(price) || price < ITEM_MIN_PRICE
  ) {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }

  const item = await adminCreateItem(username, {
    creatorUsername: creatorUsername.trim().toLowerCase(),
    name: name.trim(),
    description: description.trim(),
    imageUrl: imageUrl.trim(),
    price,
  });
  return NextResponse.json({ item });
});
