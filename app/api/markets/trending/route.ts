import { NextResponse } from 'next/server';

const HIVEPREDICT_URL = 'https://hivepredict.app/api/markets/trending?limit=5';

export interface TrendingMarket {
  id: string;
  title: string;
  category: string;
  token: string;
  totalPool: string;
  outcomeLabels: Record<string, string>;
  outcomePools: Record<string, string>;
}

// Thin cached proxy for HivePredict's public trending endpoint — same data,
// same shape, just fronted so every Snapie visitor doesn't hit their API
// directly and so a HivePredict outage/CORS change can't break our sidebar.
export async function GET() {
  try {
    const res = await fetch(HIVEPREDICT_URL, { next: { revalidate: 300 } });
    if (!res.ok) return NextResponse.json({ markets: [] }, { status: 200 });
    const data = (await res.json()) as { markets?: TrendingMarket[] };
    return NextResponse.json({ markets: data.markets ?? [] }, { status: 200 });
  } catch {
    return NextResponse.json({ markets: [] }, { status: 200 });
  }
}
