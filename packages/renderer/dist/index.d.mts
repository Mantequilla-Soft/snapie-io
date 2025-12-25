/**
 * @snapie/renderer
 *
 * A configurable Hive blockchain markdown renderer with support for:
 * - 3Speak video/audio embeds
 * - IPFS content handling
 * - Hive frontend URL conversion
 * - XSS protection via DOMPurify
 */
/**
 * Configuration options for the Hive markdown renderer
 */
interface HiveRendererOptions {
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
    /** Enable rendering :emoji: tokens as Hivemoji images (default: false) */
    enableHivemoji?: boolean;
    /** Base URL for the Hivemoji API (default: "https://hivemoji.hivelytics.io") */
    hivemojiBaseUrl?: string;
    /** Fallback owner for :emoji: tokens when no owner is provided */
    hivemojiDefaultOwner?: string;
}
/**
 * Per-render context options
 */
interface HiveRendererContext {
    /** Default owner to resolve :emoji: tokens (usually the post author) */
    defaultEmojiOwner?: string;
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
declare function createHiveRenderer(options?: HiveRendererOptions): (markdown: string, context?: HiveRendererContext) => string;
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
declare const renderHiveMarkdown: (markdown: string, context?: HiveRendererContext) => string;

export { type HiveRendererContext, type HiveRendererOptions, createHiveRenderer, renderHiveMarkdown };
