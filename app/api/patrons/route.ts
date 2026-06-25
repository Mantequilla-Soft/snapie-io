import { NextResponse } from 'next/server';
import hardcoded from '@/data/supporters.json';

const SIDECAR_URL = process.env.HIVE_ACTIVITY_SIDECAR_URL ?? 'http://127.0.0.1:3099';

type PatronTier = 'snaperino' | 'snapian' | 'snap-master';
interface PatronEntry { account: string; tier: PatronTier; via?: string; }

const TIER_ORDER: Record<PatronTier, number> = { 'snap-master': 0, 'snapian': 1, 'snaperino': 2 };

function mergePatrons(sidecar: PatronEntry[]): PatronEntry[] {
  const map = new Map<string, PatronEntry>();
  for (const p of sidecar) map.set(p.account, p);
  for (const h of hardcoded) {
    const existing = map.get(h.account);
    if (!existing || TIER_ORDER[h.tier as PatronTier] < TIER_ORDER[existing.tier]) {
      map.set(h.account, { account: h.account, tier: h.tier as PatronTier });
    }
  }
  return Array.from(map.values());
}

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    const res = await fetch(`${SIDECAR_URL}/patrons`, {
      signal: AbortSignal.timeout(3000),
    });
    const sidecar: PatronEntry[] = res.ok ? (await res.json()).patrons ?? [] : [];
    // Patron status changes rarely (a delegation sync or a monthly transfer) —
    // same cacheable pattern as /api/trending-authors.
    return NextResponse.json({ patrons: mergePatrons(sidecar) }, {
      status: 200,
      headers: { 'Cache-Control': 'public, max-age=120, stale-while-revalidate=300' },
    });
  } catch {
    return NextResponse.json({ patrons: mergePatrons([]) }, { status: 200 });
  }
}
