import { NextRequest, NextResponse } from 'next/server';

const HIVE_API = 'https://api.hive.blog';
const TTL_MS = 10 * 60 * 1000;

const cache = new Map<string, { thumbnailUrl: string; title: string; author: string; at: number }>();

export async function GET(req: NextRequest) {
    const v = req.nextUrl.searchParams.get('v');
    if (!v) return NextResponse.json({ error: 'Missing v param' }, { status: 400 });

    const slash = v.indexOf('/');
    if (slash === -1) return NextResponse.json({ error: 'Invalid v param' }, { status: 400 });
    const author = v.slice(0, slash);
    const permlink = v.slice(slash + 1);

    const hit = cache.get(v);
    if (hit && Date.now() - hit.at < TTL_MS) {
        return NextResponse.json({ thumbnailUrl: hit.thumbnailUrl, title: hit.title, author: hit.author });
    }

    try {
        const res = await fetch(HIVE_API, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: '2.0',
                method: 'condenser_api.get_content',
                params: [author, permlink],
                id: 1,
            }),
            signal: AbortSignal.timeout(8_000),
        });
        if (!res.ok) throw new Error(`Hive API ${res.status}`);
        const data = await res.json();
        const post = data.result;
        let meta: any = {};
        try { meta = JSON.parse(post.json_metadata || '{}'); } catch {}
        const thumbnailUrl: string = meta.image?.[0] ?? '';
        const title: string = post.title ?? '';
        cache.set(v, { thumbnailUrl, title, author, at: Date.now() });
        return NextResponse.json({ thumbnailUrl, title, author });
    } catch (err) {
        console.error('[short-meta]', err);
        return NextResponse.json({ error: 'Failed to fetch metadata' }, { status: 502 });
    }
}
