import { describe, expect, it, vi } from 'vitest';
import { resolveFeedImageSrc } from './feedImageSrc';
import {
  fetchProxiedImage,
  ImageProxyError,
  type ImageProxyDeps,
  type ProxyUpstream,
} from './imageProxy';

const JPEG = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
]);

const DEAD = 'https://cdn.discordapp.com/attachments/1/2/missing-banner.png';

function upstream(partial: Partial<ProxyUpstream> & Pick<ProxyUpstream, 'status'>): ProxyUpstream {
  return {
    location: undefined,
    contentType: 'image/jpeg',
    contentLength: JPEG.length,
    body: JPEG,
    ...partial,
  };
}

function deps(request: ImageProxyDeps['request']): ImageProxyDeps {
  return {
    resolve: vi.fn(async () => [{ address: '1.1.1.1', family: 4 as const }]),
    request,
  };
}

describe('feed image proxy fallback', () => {
  it('points the feed at the same-origin proxy, never the dead host', () => {
    const resolved = resolveFeedImageSrc(DEAD);
    expect(resolved).toEqual({
      src: `/api/image-proxy?url=${encodeURIComponent(DEAD)}`,
      unoptimized: false,
    });
    expect(resolved?.src.startsWith('/api/image-proxy?url=')).toBe(true);
    expect(resolved?.src).not.toContain('cdn.discordapp.com/');
  });

  it('still returns image bytes when the original host is dead and Hive has a copy', async () => {
    const request = vi.fn(async (target: URL) => {
      if (target.hostname === 'images.hive.blog') return upstream({ status: 200 });
      return upstream({ status: 404, body: Buffer.from('missing'), contentType: 'text/plain' });
    });
    const image = await fetchProxiedImage(DEAD, deps(request));
    expect(image.fallback).toBe('hive');
    expect(image.contentType).toBe('image/jpeg');
    expect(image.body.equals(JPEG)).toBe(true);
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('fails as a proxy error when the original and the Hive copy are both missing', async () => {
    const request = vi.fn(async () => upstream({
      status: 404,
      body: Buffer.from('missing'),
      contentType: 'text/plain',
    }));
    await expect(fetchProxiedImage(DEAD, deps(request))).rejects.toBeInstanceOf(ImageProxyError);
    await expect(fetchProxiedImage(DEAD, deps(request))).rejects.toMatchObject({
      status: 502,
      code: 'upstream-status',
    });
  });
});
