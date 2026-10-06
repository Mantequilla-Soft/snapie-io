import { NextRequest, NextResponse } from 'next/server';
import { fetchProxiedImage, ImageProxyError } from '@/lib/images/imageProxy';

export const runtime = 'nodejs';

// In-memory IP limiter — resets on cold start, same pattern as translate.
// 60/min rather than translate's 10/min: a feed scroll loads many thumbnails.
const RATE_LIMIT = 60;
const RATE_WINDOW_MS = 60_000;
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string): boolean {
    const now = Date.now();
    const entry = rateLimitMap.get(ip);
    if (!entry || now > entry.resetAt) {
        rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
        return true;
    }
    if (entry.count >= RATE_LIMIT) return false;
    entry.count++;
    return true;
}

/**
 * Same-origin stand-in for arbitrary feed image URLs.
 *
 * A dead or non-image upstream is retried once via images.hive.blog. When
 * that retry is what served the bytes, the response includes
 * `X-Image-Proxy-Fallback: hive`.
 *
 * `next/image` optimizes this path (see images.localPatterns). The browser
 * never names the upstream host to the optimizer, and this handler never
 * answers with a redirect — bytes are re-served from our origin after the
 * checks in `fetchProxiedImage`.
 */
export async function GET(request: NextRequest) {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
    if (!checkRateLimit(ip)) {
        return new NextResponse('Too many requests', {
            status: 429,
            headers: { 'Retry-After': '60', 'Cache-Control': 'no-store' },
        });
    }

    const urls = request.nextUrl.searchParams.getAll('url');
    if (urls.length !== 1) {
        return new NextResponse('Invalid image url', { status: 400 });
    }

    try {
        const image = await fetchProxiedImage(urls[0]);
        const headers: Record<string, string> = {
            'Content-Type': image.contentType,
            'Content-Length': String(image.body.length),
            'Cache-Control': 'public, max-age=86400, s-maxage=86400',
            'X-Content-Type-Options': 'nosniff',
            'Content-Disposition': 'inline',
            // The response is an image, never a document. SVG is already
            // rejected; this stops a sniffed-wrong payload from running
            // if a browser navigates here directly.
            'Content-Security-Policy': "default-src 'none'; sandbox",
        };
        if (image.fallback) headers['X-Image-Proxy-Fallback'] = image.fallback;
        return new NextResponse(new Uint8Array(image.body), {
            status: 200,
            headers,
        });
    } catch (err) {
        if (err instanceof ImageProxyError) {
            if (err.status === 403 || err.status >= 500) {
                console.warn('[image-proxy]', err.code);
            }
            return new NextResponse(err.message, {
                status: err.status,
                headers: { 'Cache-Control': 'no-store' },
            });
        }
        console.error('[image-proxy] unexpected failure', err);
        return new NextResponse('Image fetch failed', {
            status: 502,
            headers: { 'Cache-Control': 'no-store' },
        });
    }
}
