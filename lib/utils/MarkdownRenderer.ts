

import { DefaultRenderer } from "@hiveio/content-renderer";
import DOMPurify from 'isomorphic-dompurify';

function transformIPFSContent(content: string): string {
    const regex = /<iframe src="https:\/\/ipfs\.skatehive\.app\/ipfs\/([a-zA-Z0-9-?=&]+)"(?:(?!<\/iframe>).)*\sallowfullscreen><\/iframe>/g;
  
    return content.replace(regex, (match, videoID) => {
      return `<video controls muted preload="none" loading="lazy"> 
                  <source src="https://ipfs.skatehive.app/ipfs/${videoID}" type="video/mp4">
              </video>`;
    });
}

function transform3SpeakContent(content: string): string {
    // Track embedded video/audio IDs to prevent duplicates
    const embeddedVideos = new Set<string>();
    const embeddedAudios = new Set<string>();

    // Handle LEGACY 3speak.tv URLs (without play. subdomain) - convert to play.3speak.tv/watch
    content = content.replace(
        /<a[^>]*href="(https?:\/\/3speak\.tv\/watch\?v=([^"&]+)[^"]*)"[^>]*>.*?<\/a>/g,
        (match, fullUrl, videoId) => {
            if (embeddedVideos.has(videoId)) {
                return match; // Keep as link if already embedded
            }
            embeddedVideos.add(videoId);
            const embedUrl = `https://play.3speak.tv/watch?v=${videoId}&mode=iframe`;
            return `<div class="video-container"><iframe src="${embedUrl}" allowfullscreen loading="lazy"></iframe></div>`;
        }
    );

    // Handle 3Speak watch URLs (with play. subdomain)
    content = content.replace(
        /<a[^>]*href="(https?:\/\/play\.3speak\.tv\/watch\?v=([^"&]+)[^"]*)"[^>]*>.*?<\/a>/g,
        (match, fullUrl, videoId) => {
            if (embeddedVideos.has(videoId)) {
                return match; // Keep as link if already embedded
            }
            embeddedVideos.add(videoId);
            const embedUrl = `https://play.3speak.tv/watch?v=${videoId}&mode=iframe`;
            return `<div class="video-container"><iframe src="${embedUrl}" allowfullscreen loading="lazy"></iframe></div>`;
        }
    );

    // Handle 3Speak embed URLs (new format)
    content = content.replace(
        /<a[^>]*href="(https?:\/\/play\.3speak\.tv\/embed\?v=([^"&]+)[^"]*)"[^>]*>.*?<\/a>/g,
        (match, fullUrl, videoId) => {
            if (embeddedVideos.has(videoId)) {
                return match; // Keep as link if already embedded
            }
            embeddedVideos.add(videoId);
            const embedUrl = `https://play.3speak.tv/embed?v=${videoId}&mode=iframe`;
            return `<div class="video-container"><iframe src="${embedUrl}" allowfullscreen loading="lazy"></iframe></div>`;
        }
    );

    // Handle 3Speak audio URLs
    content = content.replace(
        /<a[^>]*href="(https?:\/\/audio\.3speak\.tv\/play\?a=([^"&]+)[^"]*)"[^>]*>.*?<\/a>/g,
        (match, fullUrl, audioId) => {
            if (embeddedAudios.has(audioId)) {
                return match; // Keep as link if already embedded
            }
            embeddedAudios.add(audioId);
            const embedUrl = `https://audio.3speak.tv/play?a=${audioId}`;
            return `<iframe src="${embedUrl}" loading="lazy"></iframe>`;
        }
    );

    return content;
}

function preventIPFSDownloads(content: string): string {
    // Find links to IPFS content and add target="_blank" and safety attributes
    // This prevents the browser from trying to navigate to/download IPFS files
    return content.replace(
        /<a href="(https?:\/\/[^"]*(?:ipfs|bafy|Qm)[^"]*)"([^>]*)>/gi,
        '<a href="$1" target="_blank" rel="noopener noreferrer"$2 onclick="event.preventDefault(); window.open(this.href, \'_blank\'); return false;">'
    );
}

function convertHiveUrlsToInternal(content: string): string {
    // List of known Hive frontends
    const hiveFrontends = [
        'peakd.com',
        'ecency.com',
        'hive.blog',
        'hiveblog.io',
        'leofinance.io',
        '3speak.tv',
        'd.tube',
        'esteem.app',
        'busy.org',
        'snapie.io'
    ];
    
    // Create regex pattern for all frontends
    const frontendsPattern = hiveFrontends.map(domain => domain.replace('.', '\\.')).join('|');
    
    // Match Hive post URLs: https://frontend.com/category/@author/permlink or https://frontend.com/@author/permlink
    const hiveUrlRegex = new RegExp(
        `<a href="https?:\\/\\/(${frontendsPattern})\\/((?:[^/]+\\/)?@([a-z0-9.-]+)\\/([a-z0-9-]+))"([^>]*)>`,
        'gi'
    );
    
    return content.replace(hiveUrlRegex, (match, frontend, fullPath, author, permlink, attributes) => {
        // Convert to internal link format: /@author/permlink
        const internalUrl = `/@${author}/${permlink}`;
        return `<a href="${internalUrl}"${attributes}>`;
    });
}

export default function markdownRenderer(markdown: string) {

    const renderer = new DefaultRenderer({
        baseUrl: "https://hive.blog/",
        breaks: true,
        skipSanitization: false, // Enable sanitization for security
        allowInsecureScriptTags: false,
        addNofollowToLinks: true,
        doNotShowImages: false,
        assetsWidth: 540,
        assetsHeight: 380,
        imageProxyFn: (url: string) => {
            // Add error handling and caching for images
            try {
                // Use a more reliable image proxy or fallback
                if (url.includes('ipfs')) {
                    return `https://ipfs.io/ipfs/${url.split('/ipfs/')[1]}`;
                }
                return url;
            } catch (error) {
                console.warn('Image proxy error:', error);
                return url;
            }
        },
        usertagUrlFn: (account: string) => "/@" + account,
        hashtagUrlFn: (hashtag: string) => "/trending/" + hashtag,
        isLinkSafeFn: (url: string) => true,
        addExternalCssClassToMatchingLinksFn: (url: string) => true,
        ipfsPrefix: "https://ipfs.skatehive.app" // IPFS gateway to display ipfs images
    });

    let safeHtmlStr = renderer.render(markdown);
    
    // Transform 3Speak video/audio URLs to iframes (AFTER rendering)
    safeHtmlStr = transform3SpeakContent(safeHtmlStr);
    
    // Transform IPFS iframes to video tags
    safeHtmlStr = transformIPFSContent(safeHtmlStr);
    
    // Prevent direct IPFS links from triggering downloads
    safeHtmlStr = preventIPFSDownloads(safeHtmlStr);
    
    // Convert Hive frontend URLs to internal links
    safeHtmlStr = convertHiveUrlsToInternal(safeHtmlStr);

    // Sanitize with DOMPurify to prevent XSS attacks
    // Configure DOMPurify to allow safe HTML tags including iframes for embeds
    const cleanHtml = DOMPurify.sanitize(safeHtmlStr, {
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
            'start', 'reversed'
        ],
        ALLOWED_URI_REGEXP: /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp|ipfs):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
        ALLOW_DATA_ATTR: false,
        ALLOW_UNKNOWN_PROTOCOLS: false,
        FORBID_TAGS: ['script', 'form', 'input', 'button', 'textarea', 'select', 'dialog', 'object', 'embed', 'applet', 'base', 'link', 'meta'],
        FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onmouseout', 'onmousemove', 'onmouseenter', 'onmouseleave', 'onfocus', 'onblur', 'onchange', 'onsubmit', 'onkeydown', 'onkeyup', 'onkeypress'],
        KEEP_CONTENT: true,
        RETURN_TRUSTED_TYPE: false
    });

    return cleanHtml;
}