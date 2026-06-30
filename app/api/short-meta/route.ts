import { NextRequest, NextResponse } from 'next/server';
import { extractVideoPermlink, pickTitle, pickThumbnail } from '@/lib/shorts/shortMeta';

const HIVE_API = 'https://api.hive.blog';
const WATCH_API = 'https://play.3speak.tv/api/watch';
const TTL_MS = 10 * 60 * 1000;

type ShortMetaResponse = {
    author: string;
    hivePermlink: string;
    videoPermlink: string;
    thumbnailUrl: string;
    title: string;
    stats: { likes: number; comments: number; payout: string };
};

const cache = new Map<string, { data: ShortMetaResponse; at: number }>();

async function fetchWatch(author: string, videoPermlink: string): Promise<{ thumbnail?: string; title?: string } | null> {
    try {
        const res = await fetch(`${WATCH_API}?v=${encodeURIComponent(`${author}/${videoPermlink}`)}`, {
            signal: AbortSignal.timeout(8_000),
        });
        if (!res.ok) return null;
        const data = await res.json();
        if (!data?.success) return null;
        return { thumbnail: data.thumbnail, title: data.title };
    } catch {
        return null;
    }
}

export async function GET(req: NextRequest) {
    const v = req.nextUrl.searchParams.get('v');
    if (!v) return NextResponse.json({ error: 'Missing v param' }, { status: 400 });

    const slash = v.indexOf('/');
    if (slash === -1) return NextResponse.json({ error: 'Invalid v param' }, { status: 400 });
    const author = v.slice(0, slash);
    const hivePermlink = v.slice(slash + 1);

    const hit = cache.get(v);
    if (hit && Date.now() - hit.at < TTL_MS) {
        return NextResponse.json(hit.data);
    }

    try {
        const res = await fetch(HIVE_API, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: '2.0',
                method: 'condenser_api.get_content',
                params: [author, hivePermlink],
                id: 1,
            }),
            signal: AbortSignal.timeout(8_000),
        });
        if (!res.ok) throw new Error(`Hive API ${res.status}`);
        const data = await res.json();
        const post = data.result;
        if (!post || !post.author) {
            return NextResponse.json({ error: 'Short not found' }, { status: 404 });
        }

        let meta: any = {};
        try { meta = JSON.parse(post.json_metadata || '{}'); } catch {}

        const videoPermlink = extractVideoPermlink(meta, hivePermlink);
        const watch = await fetchWatch(author, videoPermlink);

        const result: ShortMetaResponse = {
            author,
            hivePermlink,
            videoPermlink,
            thumbnailUrl: pickThumbnail(watch?.thumbnail, meta.image?.[0]),
            title: pickTitle(post, watch?.title),
            stats: {
                likes: post.active_votes?.length ?? 0,
                comments: post.children ?? 0,
                payout: post.pending_payout_value ? String(post.pending_payout_value).replace(/\s*HBD$/, '') : '0.00',
            },
        };

        cache.set(v, { data: result, at: Date.now() });
        return NextResponse.json(result);
    } catch (err) {
        console.error('[short-meta]', err);
        return NextResponse.json({ error: 'Failed to fetch metadata' }, { status: 502 });
    }
}
