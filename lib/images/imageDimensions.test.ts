import { afterEach, describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';

vi.mock('@/lib/images/imageProxy', async () => {
  const actual = await vi.importActual<typeof import('@/lib/images/imageProxy')>('@/lib/images/imageProxy');
  return {
    ...actual,
    fetchProxiedImage: vi.fn(),
  };
});

import { fetchProxiedImage, ImageProxyError } from '@/lib/images/imageProxy';
import {
  extractOriginalImageUrls,
  measureImageBuffer,
  prefetchPostImageDimensions,
  resetImageDimensionCacheForTests,
  resolveImageDimensions,
} from './imageDimensions';
import { IMAGE_PROXY_PATH } from './feedImageSrc';

async function png(width: number, height: number): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: '#00a8ff' } }).png().toBuffer();
}

afterEach(() => {
  resetImageDimensionCacheForTests();
  vi.mocked(fetchProxiedImage).mockReset();
});

describe('measureImageBuffer', () => {
  it('reads png dimensions and returns null for junk', async () => {
    expect(await measureImageBuffer(await png(80, 40))).toEqual({ width: 80, height: 40 });
    expect(await measureImageBuffer(Buffer.from('not-an-image'))).toBeNull();
  });
});

describe('resolveImageDimensions', () => {
  it('caches a successful lookup and a policy miss', async () => {
    vi.mocked(fetchProxiedImage).mockResolvedValue({
      body: await png(320, 160),
      contentType: 'image/png',
    });
    const url = 'https://files.peakd.com/file/a.png';
    await expect(resolveImageDimensions(url)).resolves.toEqual({ width: 320, height: 160 });
    await expect(resolveImageDimensions(url)).resolves.toEqual({ width: 320, height: 160 });
    expect(fetchProxiedImage).toHaveBeenCalledTimes(1);

    vi.mocked(fetchProxiedImage).mockRejectedValue(new ImageProxyError(403, 'blocked-host'));
    await expect(resolveImageDimensions('http://127.0.0.1/a.png')).resolves.toBeNull();
    await expect(resolveImageDimensions('http://127.0.0.1/a.png')).resolves.toBeNull();
    expect(fetchProxiedImage).toHaveBeenCalledTimes(2);
  });
});

describe('extractOriginalImageUrls and prefetch', () => {
  it('skips hivemoji and fills a map for content images', async () => {
    const original = 'https://files.peakd.com/file/a.jpg';
    const src = `${IMAGE_PROXY_PATH}?url=${encodeURIComponent(original)}`;
    const html = `<img src="${src}"><img class="hivemoji__img" src="${src}">`;
    expect(extractOriginalImageUrls(html)).toEqual([original]);

    vi.mocked(fetchProxiedImage).mockResolvedValue({
      body: await png(100, 50),
      contentType: 'image/png',
    });
    await expect(prefetchPostImageDimensions(html)).resolves.toEqual({
      [original]: { width: 100, height: 50 },
    });
  });
});
