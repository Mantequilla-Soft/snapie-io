/**
 * Markdown Renderer for Snapie.io
 * 
 * Uses @snapie/renderer SDK for Hive blockchain markdown rendering
 * with 3Speak, IPFS, and media embed support
 */

import { createHiveRenderer, HiveRendererContext, HiveRendererOptions } from '@snapie/renderer';
import { rewriteHtmlImageSrcs } from '@/lib/images/markdownImages';
import { applyPostImageLayout } from '@/lib/images/postImageLayout';
import type { ImageSizeMap } from '@/lib/images/imageDimensions.shared';

// Custom configuration for Snapie.io
const snapieRendererOptions: Partial<HiveRendererOptions> = {
    // Use Snapie's internal link format
    usertagUrlFn: (account: string) => `/@${account}`,
    hashtagUrlFn: (hashtag: string) => `/explore/${hashtag}`,
    
    // IPFS gateways - 3Speak is default, with fallbacks
    // (SDK defaults to 3speak.tv with skatehive + cloudflare + ipfs.io fallbacks)
    // Only override if you need different gateways
    
    // Add snapie.io as a recognized Hive frontend
    additionalHiveFrontends: ['snapie.io'],
    
    // Standard asset sizes
    assetsWidth: 540,
    assetsHeight: 380,

    enableHivemoji: true,
    hivemojiBaseUrl: 'https://hivemoji.hivelytics.io',
};

// Create the configured renderer
const render = createHiveRenderer(snapieRendererOptions);

export interface MarkdownRenderOptions {
    defaultEmojiOwner?: string;
    /** Optional width/height map keyed by the original (unproxied) image URL. */
    imageDimensions?: ImageSizeMap;
}

/**
 * Renders Hive markdown content to sanitized HTML
 * 
 * @param markdown - Raw markdown content from Hive blockchain
 * @param options - Render context (e.g., emoji owner)
 * @returns Sanitized HTML string safe for rendering
 */
export default function markdownRenderer(
    markdown: string,
    options: MarkdownRenderOptions = {}
): string {
    const context: HiveRendererContext = {
        defaultEmojiOwner: options.defaultEmojiOwner
    };
    // HTML <img> tags, bare image URLs, and hivemoji stay in this string.
    // Markdown images that separateContent lifts into MediaRenderer are not
    // in it. Remote srcs go through the same-origin proxy, not images.hive.blog.
    // srcset/sizes (and width/height when known) are added after the rewrite
    // so phones get a smaller file and the layout can reserve space.
    return applyPostImageLayout(
        rewriteHtmlImageSrcs(render(markdown, context)),
        options.imageDimensions,
    );
}

// Also export the renderer for direct use if needed
export { render as snapieRenderer };
