import { NextResponse } from 'next/server';
import { getEquippedMap } from '@/lib/moodBadges/service';

// Public read — an equipped mood badge is exactly as public as a patron
// tier or points balance (see app/api/patrons/route.ts, app/api/points/summary/route.ts).
export async function GET() {
  const map = await getEquippedMap();
  return NextResponse.json(map, {
    headers: { 'Cache-Control': 's-maxage=120, stale-while-revalidate=60' },
  });
}
