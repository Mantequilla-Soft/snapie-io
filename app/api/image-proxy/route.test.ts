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
});
