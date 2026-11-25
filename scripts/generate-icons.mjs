// Regenerates Snapie's favicon and PWA / Apple touch icons from the master
// source artwork in assets/icon-source.png.
//
// Usage:
//   node scripts/generate-icons.mjs
//
// Outputs:
//   app/favicon.ico                    (16x16, 32x32, 48x48 PNG-in-ICO)
//   public/apple-touch-icon.png        (180x180 opaque RGB PNG)
//   public/icons/icon-192.png          (192x192 opaque RGB PNG)
//   public/icons/icon-512.png          (512x512 opaque RGB PNG)
//   public/icons/icon-maskable-512.png (512x512 opaque RGB PNG, 80% safe zone)

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_PATH = join(ROOT, 'assets', 'icon-source.png');

// Background color baked into assets/icon-source.png; used to flatten opaque
// icons and pad the maskable icon seamlessly with no visible border.
const ICON_BG = { r: 0x26, g: 0x32, b: 0x38, alpha: 1 };

// Largest first so Next.js's `image-size` probe reports `sizes="48x48"` on
// the emitted `<link rel="icon" href="/favicon.ico">` tag while browsers still
// see all three 48/32/16 frames inside the ICO directory.
const FAVICON_SIZES = [48, 32, 16];

// Scale and offset that center the astronaut badge inside the 80% safe-zone
// circle (radius 204.8 px on a 512x512 canvas) with breathing room for the
// outer cyan glow and antenna tips.
const MASKABLE_CANVAS = 512;
const MASKABLE_INNER_SIZE = 444;
const MASKABLE_LEFT = 32;
const MASKABLE_TOP = 39;

const PNG_OPTIONS = {
  compressionLevel: 9,
  palette: false,
  adaptiveFiltering: true,
};

/**
 * Packs an array of `{ size, png }` entries into a multi-resolution Windows
 * ICO buffer with PNG payloads (supported by all modern browsers and far
 * smaller than uncompressed BMP frames).
 */
export function buildPngIco(frames) {
  const headerSize = 6;
  const entrySize = 16;
  const dirSize = headerSize + entrySize * frames.length;

  let offset = dirSize;
  const entries = frames.map(({ size, png }) => {
    const entry = { size, png, offset };
    offset += png.length;
    return entry;
  });

  const out = Buffer.alloc(offset);
  out.writeUInt16LE(0, 0); // reserved
  out.writeUInt16LE(1, 2); // type: 1 = ICO
  out.writeUInt16LE(entries.length, 4);

  entries.forEach(({ size, png, offset: imgOffset }, idx) => {
    const base = headerSize + idx * entrySize;
    const dim = size >= 256 ? 0 : size;
    out.writeUInt8(dim, base + 0); // width
    out.writeUInt8(dim, base + 1); // height
    out.writeUInt8(0, base + 2); // color count
    out.writeUInt8(0, base + 3); // reserved
    out.writeUInt16LE(1, base + 4); // color planes
    out.writeUInt16LE(32, base + 6); // bits per pixel
    out.writeUInt32LE(png.length, base + 8); // bytes in resource
    out.writeUInt32LE(imgOffset, base + 12); // offset
    png.copy(out, imgOffset);
  });

  return out;
}

async function renderSquarePng(source, size) {
  let pipeline = sharp(source).flatten({ background: ICON_BG });
  if (size !== 512) {
    pipeline = pipeline.resize(size, size, {
      kernel: sharp.kernel.lanczos3,
      fit: 'cover',
    });
  }
  return pipeline.removeAlpha().png(PNG_OPTIONS).toBuffer();
}

async function renderMaskablePng(source) {
  const inner = await sharp(source)
    .flatten({ background: ICON_BG })
    .resize(MASKABLE_INNER_SIZE, MASKABLE_INNER_SIZE, {
      kernel: sharp.kernel.lanczos3,
      fit: 'contain',
      background: ICON_BG,
    })
    .png()
    .toBuffer();

  return sharp({
    create: {
      width: MASKABLE_CANVAS,
      height: MASKABLE_CANVAS,
      channels: 3,
      background: ICON_BG,
    },
  })
    .composite([{ input: inner, left: MASKABLE_LEFT, top: MASKABLE_TOP }])
    .removeAlpha()
    .png(PNG_OPTIONS)
    .toBuffer();
}

async function renderFaviconFrame(source, size) {
  return sharp(source)
    .resize(size, size, {
      kernel: sharp.kernel.lanczos3,
      fit: 'cover',
    })
    .ensureAlpha()
    .png(PNG_OPTIONS)
    .toBuffer();
}

export async function generateIcons() {
  const meta = await sharp(SOURCE_PATH).metadata();
  if (!meta.width || !meta.height || meta.width < 512 || meta.height < 512) {
    throw new Error(
      `Expected ${SOURCE_PATH} to be at least 512x512, got ${meta.width}x${meta.height}`,
    );
  }

  mkdirSync(join(ROOT, 'public', 'icons'), { recursive: true });

  const [apple180, icon192, icon512, maskable512, faviconFrames] = await Promise.all([
    renderSquarePng(SOURCE_PATH, 180),
    renderSquarePng(SOURCE_PATH, 192),
    renderSquarePng(SOURCE_PATH, 512),
    renderMaskablePng(SOURCE_PATH),
    Promise.all(
      FAVICON_SIZES.map(async (size) => ({
        size,
        png: await renderFaviconFrame(SOURCE_PATH, size),
      })),
    ),
  ]);

  const faviconIco = buildPngIco(faviconFrames);

  const outputs = [
    [join(ROOT, 'app', 'favicon.ico'), faviconIco],
    [join(ROOT, 'public', 'apple-touch-icon.png'), apple180],
    [join(ROOT, 'public', 'icons', 'icon-192.png'), icon192],
    [join(ROOT, 'public', 'icons', 'icon-512.png'), icon512],
    [join(ROOT, 'public', 'icons', 'icon-maskable-512.png'), maskable512],
  ];

  for (const [outPath, data] of outputs) {
    writeFileSync(outPath, data);
    console.log(`wrote ${outPath.replace(`${ROOT}/`, '')} (${data.length} bytes)`);
  }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  generateIcons().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
