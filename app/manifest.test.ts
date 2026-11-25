import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import manifest from './manifest';

const ROOT = process.cwd();
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function parseIcoFrames(buf: Buffer) {
  expect(buf.readUInt16LE(0)).toBe(0);
  expect(buf.readUInt16LE(2)).toBe(1);
  const count = buf.readUInt16LE(4);
  const frames: Array<{ width: number; height: number; payload: Buffer }> = [];

  for (let i = 0; i < count; i++) {
    const base = 6 + i * 16;
    const width = buf.readUInt8(base) || 256;
    const height = buf.readUInt8(base + 1) || 256;
    const size = buf.readUInt32LE(base + 8);
    const offset = buf.readUInt32LE(base + 12);
    frames.push({ width, height, payload: buf.subarray(offset, offset + size) });
  }
  return frames;
}

describe('PWA manifest and app icons', () => {
  it('keeps high-resolution master source art for regenerating icons', async () => {
    const meta = await sharp(join(ROOT, 'assets', 'icon-source.png')).metadata();
    expect(meta.format).toBe('png');
    expect(meta.width).toBeGreaterThanOrEqual(512);
    expect(meta.height).toBeGreaterThanOrEqual(512);
  });

  it('serves every manifest icon as a matching opaque PNG', async () => {
    const data = manifest();
    expect(data.icons?.length).toBeGreaterThanOrEqual(3);

    for (const icon of data.icons ?? []) {
      const [expectedW, expectedH] = String(icon.sizes).split('x').map(Number);
      const filePath = join(ROOT, 'public', icon.src.replace(/^\//, ''));
      const meta = await sharp(filePath).metadata();
      expect(meta.format).toBe('png');
      expect(meta.width).toBe(expectedW);
      expect(meta.height).toBe(expectedH);
      expect(meta.hasAlpha).toBe(false);
    }
  });

  it('provides a crisp 180x180 opaque apple-touch-icon.png', async () => {
    const meta = await sharp(join(ROOT, 'public', 'apple-touch-icon.png')).metadata();
    expect(meta.format).toBe('png');
    expect(meta.width).toBe(180);
    expect(meta.height).toBe(180);
    expect(meta.hasAlpha).toBe(false);
  });

  it('derives icon-512.png directly from the 512px source without upscaling', async () => {
    const [srcRaw, outRaw] = await Promise.all([
      sharp(join(ROOT, 'assets', 'icon-source.png'))
        .flatten({ background: { r: 0x26, g: 0x32, b: 0x38 } })
        .removeAlpha()
        .raw()
        .toBuffer(),
      sharp(join(ROOT, 'public', 'icons', 'icon-512.png')).raw().toBuffer(),
    ]);

    expect(outRaw.length).toBe(srcRaw.length);
    let totalDiff = 0;
    for (let i = 0; i < srcRaw.length; i++) {
      totalDiff += Math.abs(srcRaw[i] - outRaw[i]);
    }
    const meanAbsDiff = totalDiff / srcRaw.length;
    expect(meanAbsDiff).toBeLessThan(0.5);
  });

  it('keeps maskable icon artwork inside the 80% safe-zone circle', async () => {
    const { data, info } = await sharp(join(ROOT, 'public', 'icons', 'icon-maskable-512.png'))
      .raw()
      .toBuffer({ resolveWithObject: true });

    expect(info.width).toBe(512);
    expect(info.height).toBe(512);
    expect(info.channels).toBe(3);

    // Sample corner background color and verify every non-background pixel
    // stays within the 80% diameter (radius = 0.4 * width = 204.8 px) circle.
    const bgR = data[0];
    const bgG = data[1];
    const bgB = data[2];
    const cx = (info.width - 1) / 2;
    const cy = (info.height - 1) / 2;
    const safeRadius = info.width * 0.4;

    let maxRadius = 0;
    for (let y = 0; y < info.height; y++) {
      for (let x = 0; x < info.width; x++) {
        const idx = (y * info.width + x) * 3;
        const diff =
          Math.abs(data[idx] - bgR) +
          Math.abs(data[idx + 1] - bgG) +
          Math.abs(data[idx + 2] - bgB);
        if (diff > 24) {
          const r = Math.hypot(x - cx, y - cy);
          if (r > maxRadius) maxRadius = r;
        }
      }
    }

    expect(maxRadius).toBeGreaterThan(100);
    expect(maxRadius).toBeLessThanOrEqual(safeRadius);
  });

  it('ships a compact multi-size favicon.ico with 16, 32, and 48px PNG frames', async () => {
    const ico = readFileSync(join(ROOT, 'app', 'favicon.ico'));
    // Guard the mobile LCP favicon budget (previously regressed at 185 KB).
    expect(ico.length).toBeLessThan(15 * 1024);

    const frames = parseIcoFrames(ico);
    expect(frames.map((f) => `${f.width}x${f.height}`)).toEqual(['48x48', '32x32', '16x16']);

    for (const frame of frames) {
      expect(frame.payload.subarray(0, 8).equals(PNG_SIGNATURE)).toBe(true);
      const meta = await sharp(frame.payload).metadata();
      expect(meta.width).toBe(frame.width);
      expect(meta.height).toBe(frame.height);
    }
  });
});
