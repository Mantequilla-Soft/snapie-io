import sharp from 'sharp';

/** Allowed `w` values on `/api/image-proxy`. Reject anything else to keep the cache finite. */
export const PROXY_RESIZE_WIDTHS = [320, 640, 960, 1280] as const;
export const PROXY_RESIZE_WIDTH_SET = new Set<number>(PROXY_RESIZE_WIDTHS);

/**
 * Downscale a proxied raster image to `width`, keeping aspect ratio and
 * never enlarging. GIFs are returned unchanged so animation is preserved.
 * If the source is already that wide or narrower, the original bytes are
 * returned (no recompress).
 */
export async function resizeImageBuffer(
  body: Buffer,
  contentType: string,
  width: number,
): Promise<{ body: Buffer; contentType: string }> {
  if (!PROXY_RESIZE_WIDTH_SET.has(width)) {
    return { body, contentType };
  }
  if (contentType === 'image/gif') {
    return { body, contentType };
  }
  try {
    const image = sharp(body, { failOn: 'none', animated: false });
    const meta = await image.metadata();
    if (!meta.width || meta.width <= width) {
      return { body, contentType };
    }
    const out = await image.resize({ width, withoutEnlargement: true }).toBuffer();
    return { body: out, contentType };
  } catch {
    return { body, contentType };
  }
}

export function parseProxyWidth(raw: string | null): number | null {
  if (raw == null || raw === '') return null;
  if (!/^\d{2,5}$/.test(raw)) return null;
  const width = Number(raw);
  return PROXY_RESIZE_WIDTH_SET.has(width) ? width : null;
}
