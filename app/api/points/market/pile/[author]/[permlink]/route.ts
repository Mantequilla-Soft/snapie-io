import { NextRequest, NextResponse } from 'next/server';
import { getPile } from '@/lib/points/marketService';

// Public read — same reasoning as combflow's post-by-author-permlink route.
export async function GET(
  _req: NextRequest,
  { params }: { params: { author: string; permlink: string } },
) {
  const { author, permlink } = params;
  if (!author || !permlink) {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }

  const pile = await getPile(author, permlink);
  return NextResponse.json({ pile }, {
    headers: { 'Cache-Control': 's-maxage=30, stale-while-revalidate=30' },
  });
}
