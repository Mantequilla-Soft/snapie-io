import { NextRequest, NextResponse } from 'next/server';
import { fetchProxiedImage, ImageProxyError } from '@/lib/images/imageProxy';

export const runtime = 'nodejs';

/**
 * Same-origin stand-in for arbitrary feed image URLs.
 *
 * `next/image` optimizes this path (see images.localPatterns). The browser
 * never names the upstream host to the optimizer, and this handler never
 * answers with a redirect — bytes are re-served from our origin after the
 * checks in `fetchProxiedImage`.
 */
export async function GET(request: NextRequest) {
    const urls = request.nextUrl.searchParams.getAll('url');
    if (urls.length !== 1) {
        return new NextResponse('Invalid image url', { status: 400 });
    }

    try {
        const image = await fetchProxiedImage(urls[0]);
        return new NextResponse(new Uint8Array(image.body), {
            status: 200,
            headers: {
                'Content-Type': image.contentType,
                'Content-Length': String(image.body.length),
                'Cache-Control': 'public, max-age=86400, s-maxage=86400',
                'X-Content-Type-Options': 'nosniff',
                'Content-Disposition': 'inline',
                // The response is an image, never a document. SVG is already
                // rejected; this stops a sniffed-wrong payload from running
                // if a browser navigates here directly.
                'Content-Security-Policy': "default-src 'none'; sandbox",
            },
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
