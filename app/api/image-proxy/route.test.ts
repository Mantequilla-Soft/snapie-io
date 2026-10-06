import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/images/imageProxy', () => {
    class ImageProxyError extends Error {
        readonly status: number;
        readonly code: string;
        constructor(status: number, code: string) {
            super('Image fetch failed');
            this.status = status;
            this.code = code;
        }
    }
    return {
        ImageProxyError,
        fetchProxiedImage: vi.fn(),
        probeProxiedImage: vi.fn(),
    };
});

import { GET } from './route';
import { fetchProxiedImage, ImageProxyError, probeProxiedImage } from '@/lib/images/imageProxy';

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);

function call(path: string, ip = '203.0.113.10') {
    return GET(new NextRequest(new URL(path, 'http://127.0.0.1:3310'), {
        headers: { 'x-forwarded-for': ip },
    }));
}

afterEach(() => {
    vi.mocked(fetchProxiedImage).mockReset();
    vi.mocked(probeProxiedImage).mockReset();
});

describe('GET /api/image-proxy', () => {
    it('probe answers 200 json when the cover is missing and does not serve bytes', async () => {
        vi.mocked(probeProxiedImage).mockResolvedValue(false);
        const res = await call(`/api/image-proxy?url=${encodeURIComponent('https://cdn.discordapp.com/a.png')}&probe=1`);
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ ok: false });
        expect(res.headers.get('cache-control')).toBe('no-store');
        expect(fetchProxiedImage).not.toHaveBeenCalled();
    });

    it('probe answers ok when the image is accepted', async () => {
        vi.mocked(probeProxiedImage).mockResolvedValue(true);
        const res = await call(`/api/image-proxy?url=${encodeURIComponent('https://i.imgur.com/TyZjlBu.jpg')}&probe=1`, '203.0.113.11');
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ ok: true });
    });

    it('probe answers ok false for a blocked url without a 4xx the browser would log', async () => {
        vi.mocked(probeProxiedImage).mockResolvedValue(false);
        const res = await call(`/api/image-proxy?url=${encodeURIComponent('http://169.254.169.254/latest/meta-data/')}&probe=1`, '203.0.113.12');
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ ok: false });
    });

    it('still returns an error status for a missing image when it is not a probe', async () => {
        vi.mocked(fetchProxiedImage).mockRejectedValue(new ImageProxyError(502, 'upstream-status'));
        const res = await call(`/api/image-proxy?url=${encodeURIComponent('https://cdn.discordapp.com/missing.png')}`, '203.0.113.13');
        expect(res.status).toBe(502);
        expect(probeProxiedImage).not.toHaveBeenCalled();
    });

    it('still serves image bytes for a normal request', async () => {
        vi.mocked(fetchProxiedImage).mockResolvedValue({ body: JPEG, contentType: 'image/jpeg' });
        const res = await call(`/api/image-proxy?url=${encodeURIComponent('https://i.imgur.com/TyZjlBu.jpg')}`, '203.0.113.14');
        expect(res.status).toBe(200);
        expect(res.headers.get('content-type')).toBe('image/jpeg');
        expect(res.headers.get('x-image-proxy-fallback')).toBeNull();
        expect(probeProxiedImage).not.toHaveBeenCalled();
    });

    it('serves image bytes and marks a Hive-cache fallback', async () => {
        vi.mocked(fetchProxiedImage).mockResolvedValue({
            body: JPEG,
            contentType: 'image/jpeg',
            fallback: 'hive',
        });
        const res = await call(`/api/image-proxy?url=${encodeURIComponent('https://cdn.discordapp.com/a.png')}`, '203.0.113.20');
        expect(res.status).toBe(200);
        expect(res.headers.get('content-type')).toBe('image/jpeg');
        expect(res.headers.get('x-image-proxy-fallback')).toBe('hive');
    });

    it('does not set the fallback header for a direct hit', async () => {
        vi.mocked(fetchProxiedImage).mockResolvedValue({ body: JPEG, contentType: 'image/jpeg' });
        const res = await call(`/api/image-proxy?url=${encodeURIComponent('https://i.imgur.com/TyZjlBu.jpg')}`, '203.0.113.21');
        expect(res.status).toBe(200);
        expect(res.headers.get('x-image-proxy-fallback')).toBeNull();
    });

    it('still returns an error status when the original and the Hive cache both fail', async () => {
        vi.mocked(fetchProxiedImage).mockRejectedValue(new ImageProxyError(502, 'upstream-status'));
        const res = await call(`/api/image-proxy?url=${encodeURIComponent('https://cdn.discordapp.com/missing.png')}`, '203.0.113.22');
        expect(res.status).toBe(502);
    });

    it('uses the first forwarded address and answers 400 when the url param is missing or repeated', async () => {
        const missing = await GET(new NextRequest(new URL('/api/image-proxy', 'http://127.0.0.1:3310')));
        expect(missing.status).toBe(400);

        const forwarded = await GET(new NextRequest(new URL('/api/image-proxy', 'http://127.0.0.1:3310'), {
            headers: { 'x-forwarded-for': ' 198.51.100.8 , 203.0.113.1' },
        }));
        expect(forwarded.status).toBe(400);

        const repeated = await call(
            `/api/image-proxy?url=${encodeURIComponent('https://example.com/a.jpg')}&url=${encodeURIComponent('https://example.com/b.jpg')}`,
            '203.0.113.30',
        );
        expect(repeated.status).toBe(400);
        expect(fetchProxiedImage).not.toHaveBeenCalled();
    });

    it('probe answers ok false for a missing url, a repeated url, and an unexpected throw', async () => {
        const missing = await call('/api/image-proxy?probe=1', '203.0.113.31');
        expect(missing.status).toBe(200);
        expect(await missing.json()).toEqual({ ok: false });

        const repeated = await call(
            `/api/image-proxy?probe=1&url=${encodeURIComponent('https://example.com/a.jpg')}&url=${encodeURIComponent('https://example.com/b.jpg')}`,
            '203.0.113.32',
        );
        expect(repeated.status).toBe(200);
        expect(await repeated.json()).toEqual({ ok: false });

        vi.mocked(probeProxiedImage).mockRejectedValue(new Error('boom'));
        const thrown = await call(
            `/api/image-proxy?probe=1&url=${encodeURIComponent('https://example.com/a.jpg')}`,
            '203.0.113.33',
        );
        expect(thrown.status).toBe(200);
        expect(await thrown.json()).toEqual({ ok: false });
    });

    it('maps proxy errors to their status and unexpected failures to 502', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const error = vi.spyOn(console, 'error').mockImplementation(() => {});
        vi.mocked(fetchProxiedImage).mockRejectedValueOnce(new ImageProxyError(403, 'blocked-host'));
        const forbidden = await call(
            `/api/image-proxy?url=${encodeURIComponent('http://metadata.google.internal/x')}`,
            '203.0.113.34',
        );
        expect(forbidden.status).toBe(403);
        expect(warn).toHaveBeenCalled();

        vi.mocked(fetchProxiedImage).mockRejectedValueOnce(new ImageProxyError(415, 'not-image'));
        const unsupported = await call(
            `/api/image-proxy?url=${encodeURIComponent('https://example.com/a.svg')}`,
            '203.0.113.35',
        );
        expect(unsupported.status).toBe(415);

        vi.mocked(fetchProxiedImage).mockRejectedValueOnce(new Error('socket hang up'));
        const unexpected = await call(
            `/api/image-proxy?url=${encodeURIComponent('https://example.com/a.jpg')}`,
            '203.0.113.36',
        );
        expect(unexpected.status).toBe(502);
        expect(unexpected.headers.get('cache-control')).toBe('no-store');
        expect(error).toHaveBeenCalled();
        warn.mockRestore();
        error.mockRestore();
    });

    it('returns 429 once an address exceeds the per-minute budget, including probes', async () => {
        const ip = '203.0.113.77';
        vi.mocked(fetchProxiedImage).mockResolvedValue({ body: JPEG, contentType: 'image/jpeg' });
        for (let i = 0; i < 60; i++) {
            const res = await call(`/api/image-proxy?url=${encodeURIComponent('https://example.com/a.jpg')}`, ip);
            expect(res.status).toBe(200);
        }
        const blocked = await call(`/api/image-proxy?url=${encodeURIComponent('https://example.com/a.jpg')}`, ip);
        expect(blocked.status).toBe(429);
        expect(blocked.headers.get('retry-after')).toBe('60');

        const probe = await call(`/api/image-proxy?probe=1&url=${encodeURIComponent('https://example.com/a.jpg')}`, ip);
        expect(probe.status).toBe(200);
        expect(await probe.json()).toEqual({ ok: false });
        expect(probeProxiedImage).not.toHaveBeenCalled();
    });
});
