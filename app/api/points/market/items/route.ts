import { NextRequest, NextResponse } from 'next/server';
import { withChatAuth } from '@/lib/chat/auth';
import { ITEM_MARKET_FEATURE_FLAG, passesPointsAllowlist } from '@/lib/points/config';
import { listApprovedItems, createItem, CatalogSort } from '@/lib/points/marketService';
import { ITEM_MIN_PRICE } from '@/lib/points/marketConfig';

// Public read, same reasoning as app/api/mood-badges/equipped/route.ts:
// force-dynamic so Next doesn't statically cache this handler at build time
// and serve a stale catalog forever in production.
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const sortParam = searchParams.get('sort');
  const sort: CatalogSort = sortParam === 'new' ? 'new' : 'hot';
  const offset = Number(searchParams.get('offset') ?? 0);

  const page = await listApprovedItems(sort, Number.isFinite(offset) ? offset : 0);
  return NextResponse.json(page, {
    headers: { 'Cache-Control': 's-maxage=30, stale-while-revalidate=30' },
  });
}

export const POST = withChatAuth(async (req, { username }) => {
  if (!ITEM_MARKET_FEATURE_FLAG || !passesPointsAllowlist(username)) {
    return NextResponse.json({ error: 'not_enrolled' }, { status: 403 });
  }

  let body: { name?: unknown; description?: unknown; imageUrl?: unknown; price?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }

  const { name, description, imageUrl, price } = body;
  if (
    typeof name !== 'string' || !name.trim() || name.trim().length > 60 ||
    typeof description !== 'string' || !description.trim() || description.trim().length > 280 ||
    typeof imageUrl !== 'string' || !imageUrl.trim() ||
    typeof price !== 'number' || !Number.isFinite(price) || price < ITEM_MIN_PRICE
  ) {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }

  const result = await createItem(username, {
    name: name.trim(),
    description: description.trim(),
    imageUrl: imageUrl.trim(),
    price,
  });
  return NextResponse.json(result);
});
