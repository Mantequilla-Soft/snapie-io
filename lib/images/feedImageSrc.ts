/**
 * Turn a feed/snap image URL into a src `next/image` can optimize.
 *
 * Remote user-content hosts are not added to `images.remotePatterns`.
 * They are rewritten onto the same-origin proxy (`/api/image-proxy`), which
 * is allowlisted via `images.localPatterns`. SSRF checks happen in that
 * route — this helper only rejects schemes and shapes that must never be
 * requested.
 */
export const IMAGE_PROXY_PATH = '/api/image-proxy';

export type FeedImageSrc = {
    src: string;
    /** True when localPatterns would reject this path, so next/image must not optimize it. */
    unoptimized: boolean;
};

/**
 * Names and literals the browser must not automatically request, even via
 * our proxy. The server repeats this (and checks DNS) — a client-side miss
 * still fails closed in the route. Kept here so an obvious private URL
 * shows the fallback instead of a doomed image request.
 */
const OBVIOUSLY_BLOCKED_NAME = [
    /^localhost$/i,
    /\.localhost$/i,
    /\.local$/i,
    /\.localdomain$/i,
    /\.internal$/i,
    /\.intranet$/i,
    /\.home\.arpa$/i,
    /\.cluster\.local$/i,
    /\.svc$/i,
    /^metadata\.google\.internal$/i,
    /^metadata\.google\.com$/i,
    /^host\.docker\.internal$/i,
    /^gateway\.docker\.internal$/i,
];

// Applied only when the hostname is an IP literal. A name like
// `10.example.com` must not match `^10\.`.
const OBVIOUSLY_BLOCKED_IP = [
    /^127\./,
    /^10\./,
    /^192\.168\./,
    /^0\.0\.0\.0$/,
    /^172\.(1[6-9]|2\d|3[01])\./,
    /^169\.254\./,
    /^\[?::1]?$/,
    /^\[?::$/,
    /^\[?f[cd][0-9a-f]{2}:/i,
    /^\[?fe80:/i,
    /^\[?::ffff:7f/i,
    /^\[?::ffff:a00:/i,
    /^\[?::ffff:a9fe:/i,
    /^\[?::ffff:c0a8:/i,
];

function isObviouslyBlockedHost(hostname: string): boolean {
    const host = hostname.toLowerCase().replace(/\.$/, '');
    const bare = host.replace(/^\[|\]$/g, '');
    const looksLikeIp = bare.includes(':') || /^\d{1,3}(\.\d{1,3}){0,3}$/.test(bare);
    if (looksLikeIp) return OBVIOUSLY_BLOCKED_IP.some((pattern) => pattern.test(host));
    return OBVIOUSLY_BLOCKED_NAME.some((pattern) => pattern.test(host));
}

function pathOnly(pathname: string): string {
    const trimmed = pathname.split('?')[0].replace(/\/+$/, '');
    return (trimmed || '/').toLowerCase();
}

export function resolveFeedImageSrc(rawUrl: string): FeedImageSrc | null {
    const url = rawUrl.trim();
    if (!url || /[\u0000-\u001F\u007F]/.test(url)) return null;

    // Protocol-relative URLs (`//host/...`) are not a same-origin path.
    if (url.startsWith('/') && !url.startsWith('//')) {
        if (pathOnly(url) === '/_next/image') return null;
        // localPatterns allows the proxy's query string, and query-less
        // files. Any other query-bearing local path is served as-is so it
        // still renders, without opening the optimizer to arbitrary routes.
        const unoptimized = pathOnly(url) !== IMAGE_PROXY_PATH && url.includes('?');
        return { src: url, unoptimized };
    }

    let parsed: URL;
    try {
        parsed = new URL(url);
    } catch {
        return null;
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    if (parsed.username || parsed.password) return null;
    if (isObviouslyBlockedHost(parsed.hostname)) return null;

    const path = pathOnly(parsed.pathname);
    if (path === '/_next/image') return null;
    // Already proxied — don't wrap it again.
    if (path === IMAGE_PROXY_PATH) {
        return { src: `${parsed.pathname}${parsed.search}`, unoptimized: false };
    }

    parsed.hash = '';
    parsed.username = '';
    parsed.password = '';
    return {
        src: `${IMAGE_PROXY_PATH}?url=${encodeURIComponent(parsed.href)}`,
        unoptimized: false,
    };
}
