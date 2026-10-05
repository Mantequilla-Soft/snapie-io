import { describe, expect, it } from 'vitest';
import { IMAGE_PROXY_PATH, resolveFeedImageSrc } from './feedImageSrc';

describe('resolveFeedImageSrc', () => {
    it('rewrites an absolute http(s) image onto the same-origin proxy', () => {
        expect(resolveFeedImageSrc('https://example.com/pic.jpg')).toEqual({
            src: `${IMAGE_PROXY_PATH}?url=${encodeURIComponent('https://example.com/pic.jpg')}`,
            unoptimized: false,
        });
        expect(resolveFeedImageSrc('http://cdn.example.com/a%20b.png')).toEqual({
            src: `${IMAGE_PROXY_PATH}?url=${encodeURIComponent('http://cdn.example.com/a%20b.png')}`,
            unoptimized: false,
        });
    });

    it('leaves a query-less same-origin path alone so next/image can optimize it', () => {
        expect(resolveFeedImageSrc('/logo.png')).toEqual({ src: '/logo.png', unoptimized: false });
    });

    it('does not send other query-bearing local paths through the optimizer', () => {
        expect(resolveFeedImageSrc('/images/hero.webp?x=1')).toEqual({
            src: '/images/hero.webp?x=1',
            unoptimized: true,
        });
    });

    it('does not wrap an already-proxied url a second time', () => {
        const once = resolveFeedImageSrc('https://images.hive.blog/u/meno/avatar/sm');
        expect(resolveFeedImageSrc(once!.src)).toEqual(once);
        expect(resolveFeedImageSrc(`https://snapie.io${once!.src}`)).toEqual(once);
    });

    it('drops the fragment and refuses credentials', () => {
        expect(resolveFeedImageSrc('https://example.com/a.jpg#section')).toEqual({
            src: `${IMAGE_PROXY_PATH}?url=${encodeURIComponent('https://example.com/a.jpg')}`,
            unoptimized: false,
        });
        expect(resolveFeedImageSrc('https://user:pass@example.com/a.jpg')).toBeNull();
    });

    it('refuses non-http schemes, protocol-relative urls, and the optimizer loop', () => {
        expect(resolveFeedImageSrc('javascript:alert(1)')).toBeNull();
        expect(resolveFeedImageSrc('data:image/png;base64,aaaa')).toBeNull();
        expect(resolveFeedImageSrc('file:///etc/passwd')).toBeNull();
        expect(resolveFeedImageSrc('//evil.example/a.jpg')).toBeNull();
        expect(resolveFeedImageSrc('/_next/image?url=/etc/passwd')).toBeNull();
        expect(resolveFeedImageSrc('https://snapie.io/_next/image?url=%2Flogo.png')).toBeNull();
        expect(resolveFeedImageSrc('not a url')).toBeNull();
        expect(resolveFeedImageSrc('')).toBeNull();
    });

    it('does not point next/image at obvious private or metadata hosts', () => {
        expect(resolveFeedImageSrc('http://127.0.0.1/secret.jpg')).toBeNull();
        expect(resolveFeedImageSrc('http://192.168.0.180/photo.jpg')).toBeNull();
        expect(resolveFeedImageSrc('http://10.0.0.5/a.png')).toBeNull();
        expect(resolveFeedImageSrc('http://169.254.169.254/latest/meta-data')).toBeNull();
        expect(resolveFeedImageSrc('http://localhost/a.jpg')).toBeNull();
        expect(resolveFeedImageSrc('http://nas.local/a.jpg')).toBeNull();
        expect(resolveFeedImageSrc('http://metadata.google.internal/computeMetadata/v1/')).toBeNull();
        expect(resolveFeedImageSrc('http://[::1]/a.jpg')).toBeNull();
    });

    it('does not treat a public hostname that starts with a private-looking label as private', () => {
        expect(resolveFeedImageSrc('https://10.example.com/a.jpg')).toEqual({
            src: `${IMAGE_PROXY_PATH}?url=${encodeURIComponent('https://10.example.com/a.jpg')}`,
            unoptimized: false,
        });
    });
});
