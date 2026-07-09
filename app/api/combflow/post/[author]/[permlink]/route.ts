import { NextRequest, NextResponse } from 'next/server';
import { fetchCombflowPost, CombflowHttpError } from '@/lib/combflow/client';

export async function GET(
    _req: NextRequest,
    { params }: { params: { author: string; permlink: string } }
) {
    const { author, permlink } = params;

    if (!author || !permlink) {
        return NextResponse.json({ error: 'Missing author or permlink.' }, { status: 400 });
    }

    try {
        const data = await fetchCombflowPost(author, permlink);
        return NextResponse.json(data, {
            headers: { 'Cache-Control': 's-maxage=300, stale-while-revalidate=60' },
        });
    } catch (err) {
        if (err instanceof CombflowHttpError) {
            return NextResponse.json({ error: 'Not found.' }, { status: err.status });
        }
        return NextResponse.json({ error: 'CombFlow unreachable.' }, { status: 502 });
    }
}
