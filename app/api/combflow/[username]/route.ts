import { NextRequest, NextResponse } from 'next/server';

export async function GET(
    _req: NextRequest,
    { params }: { params: { username: string } }
) {
    const { username } = params;

    if (!username || username.length > 16) {
        return NextResponse.json({ error: 'Invalid username.' }, { status: 400 });
    }

    try {
        const res = await fetch(
            `https://combflow.net/api/authors/${encodeURIComponent(username)}/summary`,
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
