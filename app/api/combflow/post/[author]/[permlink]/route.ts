import { NextRequest, NextResponse } from 'next/server';

export async function GET(
    _req: NextRequest,
    { params }: { params: { author: string; permlink: string } }
) {
    const { author, permlink } = params;

    if (!author || !permlink) {
        return NextResponse.json({ error: 'Missing author or permlink.' }, { status: 400 });
    }

    try {
        const res = await fetch(
            `https://combflow.net/posts/${encodeURIComponent(author)}/${encodeURIComponent(permlink)}`,
            { headers: { accept: 'application/json' }, next: { revalidate: 300 } }
        );

        if (!res.ok) {
            return NextResponse.json({ error: 'Not found.' }, { status: res.status });
        }

        const data = await res.json();
        return NextResponse.json(data, {
            headers: { 'Cache-Control': 's-maxage=300, stale-while-revalidate=60' },
        });
    } catch {
        return NextResponse.json({ error: 'CombFlow unreachable.' }, { status: 502 });
    }
}
