import { IMAGE_PROXY_PATH, resolveFeedImageSrc } from './feedImageSrc';

export type MarkdownImage = {
    alt: string;
    url: string;
    start: number;
    end: number;
    fullMatch: string;
};

/**
 * Image destinations may contain balanced parentheses, as in
 * `Screenshot%20(88).jpg`. A match that stops at the first `)` truncates
 * that URL. This walks the destination with a depth counter instead.
 */
export function extractMarkdownImages(source: string): MarkdownImage[] {
    const images: MarkdownImage[] = [];
    const opener = /!\[([^\]]*)\]\(/g;
    let match: RegExpExecArray | null;
    while ((match = opener.exec(source)) !== null) {
        const start = match.index;
        const urlStart = start + match[0].length;
        let depth = 1;
        let i = urlStart;
        for (; i < source.length; i += 1) {
            const ch = source[i];
            if (ch === '\\' && i + 1 < source.length) {
                i += 1;
                continue;
            }
            if (ch === '(') depth += 1;
            else if (ch === ')') {
                depth -= 1;
                if (depth === 0) break;
            }
        }
        if (depth !== 0) {
            opener.lastIndex = urlStart;
            continue;
        }
        const url = stripMarkdownDestinationTitle(source.slice(urlStart, i));
        const end = i + 1;
        images.push({
            alt: match[1],
            url,
            start,
            end,
            fullMatch: source.slice(start, end),
        });
        opener.lastIndex = end;
    }
    return images;
}

function stripMarkdownDestinationTitle(destination: string): string {
    const trimmed = destination.trim();
    const titled = /^(.*?)\s+(["'])[\s\S]*\2\s*$/.exec(trimmed);
    return (titled ? titled[1] : trimmed).trim();
}

export function encodeMarkdownUrlParentheses(url: string): string {
    return url.replace(/\(/g, '%28').replace(/\)/g, '%29');
}

/**
 * Percent-encode parentheses inside markdown image URLs so a later
 * `)`-terminated regex keeps the whole destination. Other text is unchanged.
 */
export function encodeMarkdownImageParentheses(source: string): string {
    const images = extractMarkdownImages(source);
    if (!images.some((img) => img.url.includes('(') || img.url.includes(')'))) return source;
    let out = '';
    let cursor = 0;
    for (const img of images) {
        out += source.slice(cursor, img.start);
        out += `![${img.alt}](${encodeMarkdownUrlParentheses(img.url)})`;
        cursor = img.end;
    }
    out += source.slice(cursor);
    return out;
}

function decodeBasicEntities(value: string): string {
    return value
        .replace(/&amp;/gi, '&')
        .replace(/&quot;/gi, '"')
        .replace(/&#0*39;/g, "'")
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>');
}

/**
 * Point remote `<img src>` values at `/api/image-proxy`. Same-origin paths
 * and URLs the feed helper refuses are left alone. images.hive.blog is not
 * used as a replacement src.
 */
export function rewriteHtmlImageSrcs(html: string): string {
    return html.replace(
        /(<img\b[^>]*?\ssrc\s*=\s*)(["'])([\s\S]*?)\2/gi,
        (match, prefix: string, quote: string, rawSrc: string) => {
            const src = decodeBasicEntities(rawSrc);
            const resolved = resolveFeedImageSrc(src);
            if (!resolved || !resolved.src.startsWith(`${IMAGE_PROXY_PATH}?`)) return match;
            if (resolved.src === rawSrc) return match;
            return `${prefix}${quote}${resolved.src}${quote}`;
        },
    );
}
