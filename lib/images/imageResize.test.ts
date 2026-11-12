import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { parseProxyWidth, resizeImageBuffer } from './imageResize';

async function png(width: number, height: number): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: '#123456' } }).png().toBuffer();
}

describe('parseProxyWidth', () => {
  it('accepts only the allowlisted widths', () => {
    expect(parseProxyWidth('640')).toBe(640);
    expect(parseProxyWidth('1280')).toBe(1280);
    expect(parseProxyWidth('100')).toBeNull();
    expect(parseProxyWidth('640x')).toBeNull();
    expect(parseProxyWidth(null)).toBeNull();
  });
});

describe('resizeImageBuffer', () => {
  it('downscales a wide png and leaves a narrower one and a gif alone', async () => {
    const source = await png(1000, 500);
    const resized = await resizeImageBuffer(source, 'image/png', 320);
    const meta = await sharp(resized.body).metadata();
    expect(meta.width).toBe(320);
    expect(meta.height).toBe(160);

    const small = await png(200, 100);
    const same = await resizeImageBuffer(small, 'image/png', 320);
    expect(same.body).toBe(small);

    const gif = Buffer.from('GIF89a-not-really');
    const untouched = await resizeImageBuffer(gif, 'image/gif', 320);
    expect(untouched.body).toBe(gif);
  });
});
