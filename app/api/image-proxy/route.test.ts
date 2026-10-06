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
    };
});

import { GET } from './route';
import { fetchProxiedImage, ImageProxyError } from '@/lib/images/imageProxy';

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);

function call(path: string, ip = '203.0.113.10') {
    return GET(new NextRequest(new URL(path, 'http://127.0.0.1:3310'), {
        headers: { 'x-forwarded-for': ip },
    }));
}

afterEach(() => {
    vi.mocked(fetchProxiedImage).mockReset();
});

describe('GET /api/image-proxy', () => {
    it('serves image bytes and marks a Hive-cache fallback', async () => {
        vi.mocked(fetchProxiedImage).mockResolvedValue({
            body: JPEG,
            contentType: 'image/jpeg',
            fallback: 'hive',
        });
        const res = await call(`/api/image-proxy?url=${encodeURIComponent('https://cdn.discordapp.com/a.png')}`);
        expect(res.status).toBe(200);
        expect(res.headers.get('content-type')).toBe('image/jpeg');
        expect(res.headers.get('x-image-proxy-fallback')).toBe('hive');
    });

    it('does not set the fallback header for a direct hit', async () => {
        vi.mocked(fetchProxiedImage).mockResolvedValue({ body: JPEG, contentType: 'image/jpeg' });
        const res = await call(`/api/image-proxy?url=${encodeURIComponent('https://i.imgur.com/TyZjlBu.jpg')}`, '203.0.113.11');
        expect(res.status).toBe(200);
        expect(res.headers.get('x-image-proxy-fallback')).toBeNull();
    });

    it('still returns an error status when the original and the Hive cache both fail', async () => {
        vi.mocked(fetchProxiedImage).mockRejectedValue(new ImageProxyError(502, 'upstream-status'));
        const res = await call(`/api/image-proxy?url=${encodeURIComponent('https://cdn.discordapp.com/missing.png')}`, '203.0.113.12');
        expect(res.status).toBe(502);
    });
});
