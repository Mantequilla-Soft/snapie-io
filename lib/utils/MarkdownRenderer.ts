/**
 * Markdown Renderer for Snapie.io
 * 
 * Uses @snapie/renderer SDK for Hive blockchain markdown rendering
 * with 3Speak, IPFS, and media embed support
 */

import { createHiveRenderer, HiveRendererOptions } from '@snapie/renderer';

// Custom configuration for Snapie.io
const snapieRendererOptions: Partial<HiveRendererOptions> = {
    // Use Snapie's internal link format
    usertagUrlFn: (account: string) => `/@${account}`,
    hashtagUrlFn: (hashtag: string) => `/trending/${hashtag}`,
    
    // Use skatehive IPFS gateway
    ipfsGateway: "https://ipfs.skatehive.app",
    
    // Add snapie.io as a recognized Hive frontend
    additionalHiveFrontends: ['snapie.io'],
    
    // Standard asset sizes
    assetsWidth: 540,
    assetsHeight: 380,
};

// Create the configured renderer
const render = createHiveRenderer(snapieRendererOptions);

/**
 * Renders Hive markdown content to sanitized HTML
 * 
 * @param markdown - Raw markdown content from Hive blockchain
 * @returns Sanitized HTML string safe for rendering
 */
export default function markdownRenderer(markdown: string): string {
    return render(markdown);
}

// Also export the renderer for direct use if needed
export { render as snapieRenderer };