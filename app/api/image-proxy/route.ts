import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, trustedClientIp, type RateLimitEntry } from '@/lib/http/rateLimit';
import { fetchProxiedImage, ImageProxyError, probeProxiedImage } from '@/lib/images/imageProxy';
import { resolveImageDimensions } from '@/lib/images/imageDimensions';
import { parseProxyWidth, resizeImageBuffer } from '@/lib/images/imageResize';

export const runtime = 'nodejs';

// In-memory IP limiter — resets on cold start. Keyed on the trusted client IP
// (see lib/http/rateLimit). 60/min rather than translate's 10/min: a feed
// scroll loads many thumbnails.
const RATE_LIMIT = 60;
const RATE_WINDOW_MS = 60_000;
const rateLimitMap = new Map<string, RateLimitEntry>();

function probeJson(ok: boolean): NextResponse {
    // Always 200. A missing cover must not be a failed resource in the
    // browser console. The body is only a boolean — not the upstream bytes.
    return NextResponse.json(
        { ok },
        {
            status: 200,
            headers: {
                'Cache-Control': 'no-store',
                'X-Content-Type-Options': 'nosniff',
            },
        },
    );
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
 *
 * `probe=1` is the profile-cover preflight. It runs the same fetch and the
 * same URL checks, then answers `{ ok: true | false }` with HTTP 200 so a
 * 404 cover can fall back without a console error. It does not widen the
 * set of hosts the proxy will connect to. The byte response (no `probe`)
 * is unchanged: upstream failures stay 4xx/5xx so feed images still hit
 * their onError fallback.
 */
export async function GET(request: NextRequest) {
    const probe = request.nextUrl.searchParams.get('probe') === '1';
    const ip = trustedClientIp(request.headers);
    if (!checkRateLimit(rateLimitMap, ip, RATE_LIMIT, RATE_WINDOW_MS)) {
        if (probe) return probeJson(false);
        return new NextResponse('Too many requests', {
            status: 429,
            headers: { 'Retry-After': '60', 'Cache-Control': 'no-store' },
        });
    }

    const urls = request.nextUrl.searchParams.getAll('url');
    if (urls.length !== 1) {
        if (probe) return probeJson(false);
        return new NextResponse('Invalid image url', { status: 400 });
    }

    const meta = request.nextUrl.searchParams.get('meta') === '1';
    const widthParam = request.nextUrl.searchParams.get('w');
    const width = parseProxyWidth(widthParam);
    if (widthParam != null && widthParam !== '' && width == null) {
        if (probe) return probeJson(false);
        return new NextResponse('Invalid image width', { status: 400, headers: { 'Cache-Control': 'no-store' } });
    }

    if (probe) {
        try {
            return probeJson(await probeProxiedImage(urls[0]));
        } catch (err) {
            console.error('[image-proxy] probe failed', err);
            return probeJson(false);
        }
    }

    if (meta) {
        try {
            const size = await resolveImageDimensions(urls[0]);
            return NextResponse.json(
                size ? { ok: true, width: size.width, height: size.height } : { ok: false },
                {
                    status: 200,
                    headers: {
                        'Cache-Control': size ? 'public, max-age=3600, s-maxage=3600' : 'no-store',
                        'X-Content-Type-Options': 'nosniff',
                    },
                },
            );
        } catch (err) {
            console.error('[image-proxy] meta failed', err);
            return NextResponse.json(
                { ok: false },
                { status: 200, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } },
            );
        }
    }

    try {
        const image = await fetchProxiedImage(urls[0]);
        const resized = width
            ? await resizeImageBuffer(image.body, image.contentType, width)
            : image;
        const headers: Record<string, string> = {
            'Content-Type': resized.contentType,
            'Content-Length': String(resized.body.length),
            'Cache-Control': 'public, max-age=86400, s-maxage=86400',
            'X-Content-Type-Options': 'nosniff',
            'Content-Disposition': 'inline',
            // The response is an image, never a document. SVG is already
            // rejected; this stops a sniffed-wrong payload from running
            // if a browser navigates here directly.
            'Content-Security-Policy': "default-src 'none'; sandbox",
        };
        if (image.fallback) headers['X-Image-Proxy-Fallback'] = image.fallback;
        return new NextResponse(new Uint8Array(resized.body), {
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
