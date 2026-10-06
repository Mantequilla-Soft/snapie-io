/**
 * Profile and wallet banners store an arbitrary URL in account metadata
 * (`posting_json_metadata.profile.cover_image`). Feed images already go
 * through `/api/image-proxy` rather than `images.remotePatterns`, and covers
 * use that same path.
 *
 * The Hive image host (`images.hive.blog/{w}x{h}/...`) is not used here.
 * It answers a dead upstream with HTTP 200 and a placeholder picture, so the
 * banner would not fall back to the default background. This proxy treats a
 * non-200 upstream as unavailable.
 */
import { IMAGE_PROXY_PATH, resolveFeedImageSrc } from './feedImageSrc';

/**
 * Banner slot is 200px tall and at most the lg container (~960px). 1200
 * covers that at 1x and a phone at 2x. next/image would otherwise add a
 * 3840 candidate for 2x of a 1200 slot; the loader below pins one width.
 */
export const PROFILE_COVER_WIDTH = 1200;

/** Same-origin proxy path, or null when the URL must not be requested. */
export function resolveCoverImageSrc(raw: string | null | undefined): string | null {
    const trimmed = raw?.trim() ?? '';
    if (!trimmed) return null;
    const resolved = resolveFeedImageSrc(trimmed);
    if (!resolved) return null;
    // Metadata covers are remote URLs. A same-origin path is not probed:
    // appending `probe=1` would hit the wrong route.
    if (!resolved.src.startsWith(`${IMAGE_PROXY_PATH}?url=`)) return null;
    return resolved.src;
}

/** Preflight that always expects HTTP 200 `{ ok: boolean }` from the proxy. */
export function coverProbePath(proxySrc: string): string {
    return `${proxySrc}&probe=1`;
}

/** Optimizer URL fixed at {@link PROFILE_COVER_WIDTH}. `src` is the proxy path. */
export function profileCoverLoaderSrc(src: string): string {
    return `/_next/image?url=${encodeURIComponent(src)}&w=${PROFILE_COVER_WIDTH}&q=75`;
}
