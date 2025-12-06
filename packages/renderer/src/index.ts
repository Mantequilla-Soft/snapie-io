/**
 * @snapie/renderer
 * 
 * A configurable Hive blockchain markdown renderer with support for:
 * - 3Speak video/audio embeds
 * - IPFS content handling
 * - Hive frontend URL conversion
 * - XSS protection via DOMPurify
 */

import { DefaultRenderer } from "@hiveio/content-renderer";
import DOMPurify from 'isomorphic-dompurify';

/**
 * Configuration options for the Hive markdown renderer
 */
export interface HiveRendererOptions {
    /** Base URL for relative links (default: "https://hive.blog/") */
    baseUrl?: string;
    
    /** 
     * Primary IPFS gateway URL (default: "https://ipfs.3speak.tv")
     * This is used for rendering IPFS content
     */
    ipfsGateway?: string;
    
    /**
     * Fallback IPFS gateways to try if primary fails
     * Default: ["https://ipfs.skatehive.app", "https://cloudflare-ipfs.com", "https://ipfs.io"]
     */
    ipfsFallbackGateways?: string[];
    
    /** Function to transform user mentions to URLs (default: (account) => "/@" + account) */
    usertagUrlFn?: (account: string) => string;
    
    /** Function to transform hashtags to URLs (default: (hashtag) => "/trending/" + hashtag) */
    hashtagUrlFn?: (hashtag: string) => string;
    
    /** Additional Hive frontends to recognize for URL conversion */
    additionalHiveFrontends?: string[];
    
    /** Whether to convert Hive frontend URLs to internal links (default: true) */
    convertHiveUrls?: boolean;
    
    /** Internal URL prefix for converted Hive links (default: "") - e.g., "" produces "/@author/permlink" */
    internalUrlPrefix?: string;
    
    /** Asset dimensions */
    assetsWidth?: number;
    assetsHeight?: number;
    
    /** Custom image proxy function */
    imageProxyFn?: (url: string) => string;
}

/**
 * Default IPFS gateways in order of preference
 * 3Speak is primary since it's optimized for Hive content
 */
const DEFAULT_IPFS_GATEWAY = "https://ipfs.3speak.tv";
const DEFAULT_IPFS_FALLBACKS = [
    "https://ipfs.skatehive.app",
    "https://cloudflare-ipfs.com",
    "https://ipfs.io"
];

/**
 * Default Hive frontends recognized for URL conversion
 */
const DEFAULT_HIVE_FRONTENDS = [
    'peakd.com',
    'ecency.com',
    'hive.blog',
    'hiveblog.io',
    'leofinance.io',
    '3speak.tv',
    'd.tube',
    'esteem.app',
    'busy.org'
];

/**
 * DOMPurify configuration for safe HTML output
 */
const DOMPURIFY_CONFIG = {
    ALLOWED_TAGS: [
        // Text formatting
        'p', 'br', 'span', 'div', 'blockquote', 'pre', 'code',
        'strong', 'em', 'b', 'i', 'u', 'ins', 'del', 's', 'strike',
        'mark', 'sub', 'sup', 'small',
        // Headings
        'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        // Lists
        'ul', 'ol', 'li', 'dl', 'dt', 'dd',
        // Tables
        'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption', 'col', 'colgroup',
        // Links and media
        'a', 'img', 'video', 'source', 'audio', 'iframe',
        // Other safe elements
        'hr', 'center', 'details', 'summary'
    ],
    ALLOWED_ATTR: [
        'href', 'src', 'alt', 'title', 'width', 'height',
        'class', 'id', 'style', 'target', 'rel',
        'controls', 'muted', 'preload', 'loading', 'autoplay', 'loop',
        'type', 'allowfullscreen', 'frameborder', 'allow', 'scrolling',
        'colspan', 'rowspan', 'align', 'valign',
        'start', 'reversed',
        'data-dnt', 'data-theme', 'allowtransparency'
    ],
    ALLOWED_URI_REGEXP: /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp|ipfs):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
    ALLOW_DATA_ATTR: false,
    ALLOW_UNKNOWN_PROTOCOLS: false,
    FORBID_TAGS: ['script', 'form', 'input', 'button', 'textarea', 'select', 'dialog', 'object', 'embed', 'applet', 'base', 'link', 'meta'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onmouseout', 'onmousemove', 'onmouseenter', 'onmouseleave', 'onfocus', 'onblur', 'onchange', 'onsubmit', 'onkeydown', 'onkeyup', 'onkeypress'],
    KEEP_CONTENT: true,
    RETURN_TRUSTED_TYPE: false
};

/**
 * Fix malformed center tags from DefaultRenderer
 * DefaultRenderer sometimes produces: <p><center>...content...<hr />...more content...</center></p>
 */
function fixMalformedCenterTags(content: string): string {
    return content.replace(
        /<p><center>([\s\S]*?)<hr \/>([\s\S]*?)<\/center><\/p>/gi,
        (match, beforeHr, afterHr) => {
            return `<center>${beforeHr.trim()}</center><hr />${afterHr.trim()}`;
        }
    );
}

/**
 * Transform 3Speak URLs to embedded iframes
 * Handles both legacy (3speak.tv) and current (play.3speak.tv) URLs
 * Deduplicates multiple instances of the same video
 */
function transform3SpeakContent(content: string): string {
    const embeddedVideos = new Set<string>();
    const embeddedAudios = new Set<string>();

    // Fix malformed center tags first
    content = fixMalformedCenterTags(content);

    // Handle LEGACY 3speak.tv URLs (without play. subdomain)
    content = content.replace(
        /<a[^>]*href="(https?:\/\/3speak\.tv\/watch\?v=([^"&]+)[^"]*)"[^>]*>.*?<\/a>/g,
        (match, fullUrl, videoId) => {
            if (embeddedVideos.has(videoId)) return match;
            embeddedVideos.add(videoId);
            const embedUrl = `https://play.3speak.tv/watch?v=${videoId}&mode=iframe`;
            return `<div class="video-container"><iframe src="${embedUrl}" allowfullscreen loading="lazy"></iframe></div>`;
        }
    );

    // Handle 3Speak watch URLs (with play. subdomain)
    content = content.replace(
        /<a[^>]*href="(https?:\/\/play\.3speak\.tv\/watch\?v=([^"&]+)[^"]*)"[^>]*>.*?<\/a>/g,
        (match, fullUrl, videoId) => {
            if (embeddedVideos.has(videoId)) return match;
            embeddedVideos.add(videoId);
            const embedUrl = `https://play.3speak.tv/watch?v=${videoId}&mode=iframe`;
            return `<div class="video-container"><iframe src="${embedUrl}" allowfullscreen loading="lazy"></iframe></div>`;
        }
    );

    // Handle 3Speak embed URLs
    content = content.replace(
        /<a[^>]*href="(https?:\/\/play\.3speak\.tv\/embed\?v=([^"&]+)[^"]*)"[^>]*>.*?<\/a>/g,
        (match, fullUrl, videoId) => {
            if (embeddedVideos.has(videoId)) return match;
            embeddedVideos.add(videoId);
            const embedUrl = `https://play.3speak.tv/embed?v=${videoId}&mode=iframe`;
            return `<div class="video-container"><iframe src="${embedUrl}" allowfullscreen loading="lazy"></iframe></div>`;
        }
    );

    // Handle 3Speak audio URLs
    content = content.replace(
        /<a[^>]*href="(https?:\/\/audio\.3speak\.tv\/play\?a=([^"&]+)[^"]*)"[^>]*>.*?<\/a>/g,
        (match, fullUrl, audioId) => {
            if (embeddedAudios.has(audioId)) return match;
            embeddedAudios.add(audioId);
            const embedUrl = `https://audio.3speak.tv/play?a=${audioId}`;
            return `<div class="audio-container"><iframe src="${embedUrl}" loading="lazy"></iframe></div>`;
        }
    );

    return content;
}

/**
 * Transform Twitter/X URLs to embedded tweets
 * Handles both twitter.com and x.com domains
 * Uses iframe embed for security (no external scripts)
 */
function transformTwitterContent(content: string): string {
    const embeddedTweets = new Set<string>();

    // Match Twitter/X URLs in anchor tags: twitter.com/user/status/ID or x.com/user/status/ID
    const twitterRegex = /<a[^>]*href="(https?:\/\/(?:twitter\.com|x\.com)\/([^/]+)\/status\/(\d+)[^"]*)"[^>]*>.*?<\/a>/gi;
    
    content = content.replace(twitterRegex, (match, fullUrl, username, tweetId) => {
        if (embeddedTweets.has(tweetId)) return match;
        embeddedTweets.add(tweetId);
        
        // Use syndication iframe embed (no script required)
        return `<div class="twitter-embed-container" style="max-width: 550px;">
            <iframe 
                src="https://platform.twitter.com/embed/Tweet.html?id=${tweetId}&dnt=true" 
                width="550" 
                height="250" 
                frameborder="0" 
                scrolling="no" 
                allowtransparency="true"
                loading="lazy"
                style="border: 1px solid #ccc; border-radius: 12px;">
            </iframe>
        </div>`;
    });

    // Also handle plain URLs (not in anchor tags) - commonly pasted directly
    const plainTwitterRegex = /(?<![">])(https?:\/\/(?:twitter\.com|x\.com)\/([^/\s]+)\/status\/(\d+))(?![^<]*<\/a>)/gi;
    
    content = content.replace(plainTwitterRegex, (match, fullUrl, username, tweetId) => {
        if (embeddedTweets.has(tweetId)) return match;
        embeddedTweets.add(tweetId);
        
        return `<div class="twitter-embed-container" style="max-width: 550px;">
            <iframe 
                src="https://platform.twitter.com/embed/Tweet.html?id=${tweetId}&dnt=true" 
                width="550" 
                height="250" 
                frameborder="0" 
                scrolling="no" 
                allowtransparency="true"
                loading="lazy"
                style="border: 1px solid #ccc; border-radius: 12px;">
            </iframe>
        </div>`;
    });

    return content;
}

/**
 * Transform Instagram URLs to embedded posts
 * Handles posts, reels, and stories
 */
function transformInstagramContent(content: string): string {
    const embeddedPosts = new Set<string>();

    // Match Instagram URLs in anchor tags: instagram.com/p/CODE/ or instagram.com/reel/CODE/
    const instagramRegex = /<a[^>]*href="(https?:\/\/(?:www\.)?instagram\.com\/(?:p|reel|tv)\/([a-zA-Z0-9_-]+)[^"]*)"[^>]*>.*?<\/a>/gi;
    
    content = content.replace(instagramRegex, (match, fullUrl, postCode) => {
        if (embeddedPosts.has(postCode)) return match;
        embeddedPosts.add(postCode);
        
        // Use Instagram's embed iframe
        return `<div class="instagram-embed-container">
            <iframe 
                src="https://www.instagram.com/p/${postCode}/embed" 
                width="400" 
                height="480" 
                frameborder="0" 
                scrolling="no" 
                allowtransparency="true"
                loading="lazy">
            </iframe>
        </div>`;
    });

    // Also handle plain URLs (not in anchor tags)
    const plainInstagramRegex = /(?<![">])(https?:\/\/(?:www\.)?instagram\.com\/(?:p|reel|tv)\/([a-zA-Z0-9_-]+)[^\s<]*)(?![^<]*<\/a>)/gi;
    
    content = content.replace(plainInstagramRegex, (match, fullUrl, postCode) => {
        if (embeddedPosts.has(postCode)) return match;
        embeddedPosts.add(postCode);
        
        return `<div class="instagram-embed-container">
            <iframe 
                src="https://www.instagram.com/p/${postCode}/embed" 
                width="400" 
                height="480" 
                frameborder="0" 
                scrolling="no" 
                allowtransparency="true"
                loading="lazy">
            </iframe>
        </div>`;
    });

    return content;
}

/**
 * Transform IPFS iframes to native video elements with fallback sources
 */
function transformIPFSContent(
    content: string, 
    ipfsGateway: string,
    fallbackGateways: string[]
): string {
    // Match IPFS iframes from various gateways
    const ipfsGatewayPatterns = [ipfsGateway, ...fallbackGateways, 'https://ipfs.io', 'https://gateway.pinata.cloud'];
    
    for (const gateway of ipfsGatewayPatterns) {
        const regex = new RegExp(
            `<iframe src="${gateway.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/ipfs/([a-zA-Z0-9-?=&]+)"(?:(?!<\\/iframe>).)*\\sallowfullscreen><\\/iframe>`,
            'g'
        );
        
        content = content.replace(regex, (match, videoID) => {
            // Create video element with multiple source fallbacks
            const sources = [ipfsGateway, ...fallbackGateways]
                .map(gw => `<source src="${gw}/ipfs/${videoID}" type="video/mp4">`)
                .join('\n                    ');
            
            return `<video controls muted preload="none" loading="lazy"> 
                    ${sources}
                </video>`;
        });
    }
    
    return content;
}

/**
 * Add safety attributes to IPFS links to prevent unwanted downloads
 */
function preventIPFSDownloads(content: string): string {
    return content.replace(
        /<a href="(https?:\/\/[^"]*(?:ipfs|bafy|Qm)[^"]*)"([^>]*)>/gi,
        '<a href="$1" target="_blank" rel="noopener noreferrer"$2 onclick="event.preventDefault(); window.open(this.href, \'_blank\'); return false;">'
    );
}

/**
 * Convert Hive frontend URLs to internal app links
 */
function convertHiveUrlsToInternal(
    content: string, 
    hiveFrontends: string[], 
    internalPrefix: string
): string {
    const frontendsPattern = hiveFrontends.map(domain => domain.replace('.', '\\.')).join('|');
    
    const hiveUrlRegex = new RegExp(
        `<a href="https?:\\/\\/(?:www\\.)?(${frontendsPattern})\\/((?:[^/]+\\/)?@([a-z0-9.-]+)\\/([a-z0-9-]+))"([^>]*)>`,
        'gi'
    );
    
    return content.replace(hiveUrlRegex, (match, frontend, fullPath, author, permlink, attributes) => {
        const internalUrl = `${internalPrefix}/@${author}/${permlink}`;
        return `<a href="${internalUrl}"${attributes}>`;
    });
}

/**
 * Create a Hive markdown renderer with the given options
 * 
 * @param options - Configuration options for the renderer
 * @returns A function that renders markdown to HTML
 * 
 * @example
 * ```typescript
 * import { createHiveRenderer } from '@snapie/renderer';
 * 
 * const render = createHiveRenderer({
 *   ipfsGateway: 'https://ipfs.3speak.tv',
 *   additionalHiveFrontends: ['myapp.io']
 * });
 * 
 * const html = render(markdownContent);
 * ```
 */
export function createHiveRenderer(options: HiveRendererOptions = {}) {
    const {
        baseUrl = "https://hive.blog/",
        ipfsGateway = DEFAULT_IPFS_GATEWAY,
        ipfsFallbackGateways = DEFAULT_IPFS_FALLBACKS,
        usertagUrlFn = (account: string) => "/@" + account,
        hashtagUrlFn = (hashtag: string) => "/trending/" + hashtag,
        additionalHiveFrontends = [],
        convertHiveUrls = true,
        internalUrlPrefix = "",
        assetsWidth = 540,
        assetsHeight = 380,
        imageProxyFn,
    } = options;

    const hiveFrontends = [...DEFAULT_HIVE_FRONTENDS, ...additionalHiveFrontends];

    const defaultImageProxy = (url: string) => {
        try {
            if (url.includes('ipfs')) {
                const parts = url.split('/ipfs/');
                if (parts[1]) {
                    return `https://ipfs.io/ipfs/${parts[1]}`;
                }
            }
            return url;
        } catch {
            return url;
        }
    };

    const renderer = new DefaultRenderer({
        baseUrl,
        breaks: true,
        skipSanitization: false,
        allowInsecureScriptTags: false,
        addNofollowToLinks: true,
        doNotShowImages: false,
        assetsWidth,
        assetsHeight,
        imageProxyFn: imageProxyFn || defaultImageProxy,
        usertagUrlFn,
        hashtagUrlFn,
        isLinkSafeFn: () => true,
        addExternalCssClassToMatchingLinksFn: () => true,
        ipfsPrefix: ipfsGateway
    });

    return function renderHiveMarkdown(markdown: string): string {
        let html = renderer.render(markdown);
        
        // Transform 3Speak video/audio URLs to iframes
        html = transform3SpeakContent(html);
        
        // Transform IPFS iframes to video tags with fallback sources
        html = transformIPFSContent(html, ipfsGateway, ipfsFallbackGateways);
        
        // Transform Twitter/X URLs to embeds
        html = transformTwitterContent(html);
        
        // Transform Instagram URLs to embeds
        html = transformInstagramContent(html);
        
        // Prevent direct IPFS links from triggering downloads
        html = preventIPFSDownloads(html);
        
        // Convert Hive frontend URLs to internal links
        if (convertHiveUrls) {
            html = convertHiveUrlsToInternal(html, hiveFrontends, internalUrlPrefix);
        }

        // Sanitize with DOMPurify to prevent XSS attacks
        return DOMPurify.sanitize(html, DOMPURIFY_CONFIG);
    };
}

/**
 * Default renderer instance with standard configuration
 * 
 * @example
 * ```typescript
 * import { renderHiveMarkdown } from '@snapie/renderer';
 * 
 * const html = renderHiveMarkdown(markdownContent);
 * ```
 */
export const renderHiveMarkdown = createHiveRenderer();
