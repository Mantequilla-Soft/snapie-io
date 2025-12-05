import { Operation, CommentOperation, CommentOptionsOperation } from '@hiveio/dhive';
export { CommentOperation, CommentOptionsOperation, Operation } from '@hiveio/dhive';

/**
 * @snapie/composer
 *
 * A headless, auth-agnostic composer SDK for Hive blockchain posts and comments.
 *
 * This package handles:
 * - Building post/comment content with media embeds
 * - Generating Hive blockchain operations
 * - 3Speak video upload integration
 * - Image upload utilities
 *
 * It does NOT handle:
 * - Authentication (use any auth method: Aioha, Keychain, HiveSigner, etc.)
 * - UI/UX (bring your own React/Vue/Svelte components)
 * - Signing/broadcasting (handled via callbacks)
 *
 * @example
 * ```typescript
 * import { createSnapComposer, buildCommentOperation } from '@snapie/composer';
 *
 * const composer = createSnapComposer({ appName: 'my-app' });
 *
 * const operations = await composer.buildOperations({
 *   author: 'username',
 *   body: 'Hello Hive!',
 *   images: ['https://...'],
 *   parentAuthor: '',
 *   parentPermlink: 'snaps-container'
 * });
 *
 * // Submit with your preferred auth method
 * await myAuthMethod.broadcast(operations);
 * ```
 */

/**
 * Configuration options for the composer
 */
interface ComposerOptions {
    /** Application name for json_metadata (default: "snapie") */
    appName?: string;
    /** Default tags to include in posts */
    defaultTags?: string[];
    /** 3Speak API key for video uploads */
    threeSpeakApiKey?: string;
    /** IPFS upload endpoint for thumbnails */
    ipfsUploadEndpoint?: string;
    /** Image upload function - must be provided for image support */
    uploadImage?: (file: File, onProgress?: (progress: number) => void) => Promise<string>;
    /** Beneficiaries configuration */
    beneficiaries?: Beneficiary[];
    /** Whether to require beneficiaries on video posts (default: false) */
    requireBeneficiariesOnVideo?: boolean;
}
/**
 * Beneficiary recipient for post rewards
 */
interface Beneficiary {
    account: string;
    /** Weight in basis points (100 = 1%, 1000 = 10%, 10000 = 100%) */
    weight: number;
}
/**
 * Input for building a comment/post
 */
interface CommentInput {
    /** Author's Hive username */
    author: string;
    /** Post body in markdown */
    body: string;
    /** Custom permlink (auto-generated if not provided) */
    permlink?: string;
    /** Post title (empty for comments/snaps) */
    title?: string;
    /** Parent author (empty for top-level posts) */
    parentAuthor: string;
    /** Parent permlink (community tag or container permlink) */
    parentPermlink: string;
    /** Image URLs to append to body */
    images?: string[];
    /** GIF URL to append to body */
    gifUrl?: string;
    /** 3Speak video embed URL */
    videoEmbedUrl?: string;
    /** Audio embed URL */
    audioEmbedUrl?: string;
    /** Custom tags (hashtags extracted automatically from body too) */
    tags?: string[];
    /** Custom json_metadata fields */
    metadata?: Record<string, unknown>;
    /** Override beneficiaries for this specific post */
    beneficiaries?: Beneficiary[];
    /** Max accepted payout (default: "1000000.000 HBD") */
    maxAcceptedPayout?: string;
    /** Percent HBD (default: 10000 = 100%) */
    percentHbd?: number;
    /** Allow votes (default: true) */
    allowVotes?: boolean;
    /** Allow curation rewards (default: true) */
    allowCurationRewards?: boolean;
}
/**
 * Result from building operations
 */
interface ComposerResult {
    /** The operations to broadcast */
    operations: Operation[];
    /** The generated permlink */
    permlink: string;
    /** The final body content */
    body: string;
    /** The json_metadata object */
    metadata: Record<string, unknown>;
}
/**
 * Video upload progress callback
 */
type VideoProgressCallback = (progress: number, status: 'uploading' | 'processing' | 'complete' | 'error') => void;
/**
 * Video upload result
 */
interface VideoUploadResult {
    embedUrl: string;
    videoId: string;
}
/**
 * Generate a unique permlink from current timestamp
 */
declare function generatePermlink(): string;
/**
 * Extract hashtags from text content
 *
 * @param text - Text to extract hashtags from
 * @returns Array of hashtag strings (without the # symbol)
 */
declare function extractHashtags(text: string): string[];
/**
 * Build markdown image syntax from URL
 */
declare function imageToMarkdown(url: string): string;
/**
 * Build markdown for multiple images
 */
declare function imagesToMarkdown(urls: string[]): string;
/**
 * Append media embeds to body content
 */
declare function appendMediaToBody(body: string, options: {
    images?: string[];
    gifUrl?: string;
    videoEmbedUrl?: string;
    audioEmbedUrl?: string;
}): string;
/**
 * Build a comment operation
 */
declare function buildCommentOperation(input: {
    parentAuthor: string;
    parentPermlink: string;
    author: string;
    permlink: string;
    title: string;
    body: string;
    metadata: Record<string, unknown>;
}): CommentOperation;
/**
 * Build a comment_options operation (for beneficiaries, payout settings, etc.)
 */
declare function buildCommentOptionsOperation(input: {
    author: string;
    permlink: string;
    maxAcceptedPayout?: string;
    percentHbd?: number;
    allowVotes?: boolean;
    allowCurationRewards?: boolean;
    beneficiaries?: Beneficiary[];
}): CommentOptionsOperation;
/**
 * Upload a video to 3Speak using TUS protocol
 *
 * @param file - Video file to upload
 * @param options - Upload options
 * @returns Promise resolving to embed URL
 */
declare function uploadVideoTo3Speak(file: File, options: {
    apiKey: string;
    owner: string;
    appName?: string;
    onProgress?: VideoProgressCallback;
}): Promise<VideoUploadResult>;
/**
 * Extract video ID from 3Speak embed URL
 *
 * @example
 * // Input: "https://play.3speak.tv/embed?v=username/abc123"
 * // Output: "abc123"
 */
declare function extractVideoIdFromEmbedUrl(embedUrl: string): string | null;
/**
 * Set thumbnail for a 3Speak video
 */
declare function set3SpeakThumbnail(videoId: string, thumbnailUrl: string, apiKey: string): Promise<void>;
/**
 * Upload a file to IPFS (3Speak supernode)
 */
declare function uploadToIPFS(file: File | Blob, endpoint?: string): Promise<string>;
/**
 * Extract a thumbnail frame from a video file
 *
 * @param file - Video file
 * @param seekTime - Time in seconds to capture frame (default: 0.5)
 * @returns Promise resolving to thumbnail blob
 */
declare function extractVideoThumbnail(file: File, seekTime?: number): Promise<Blob>;
/**
 * Create a configured composer instance
 *
 * @example
 * ```typescript
 * const composer = createSnapComposer({
 *   appName: 'my-app',
 *   beneficiaries: [{ account: 'my-app', weight: 500 }] // 5%
 * });
 *
 * const result = await composer.buildOperations({
 *   author: 'user',
 *   body: 'Hello!',
 *   parentAuthor: '',
 *   parentPermlink: 'snaps'
 * });
 *
 * // Broadcast with any auth method
 * await myAuth.broadcast(result.operations);
 * ```
 */
declare function createSnapComposer(options?: ComposerOptions): {
    /**
     * Build operations for a comment/post
     */
    buildOperations(input: CommentInput): ComposerResult;
    /**
     * Upload a video to 3Speak
     */
    uploadVideo(file: File, owner: string, onProgress?: VideoProgressCallback): Promise<VideoUploadResult>;
    /**
     * Extract and upload a video thumbnail
     */
    uploadThumbnail(videoFile: File, uploadFn?: (blob: Blob) => Promise<string>): Promise<string>;
    /**
     * Set video thumbnail via 3Speak API
     */
    setVideoThumbnail(videoId: string, thumbnailUrl: string): Promise<void>;
    /**
     * Upload images (requires uploadImage function in config)
     */
    uploadImages(files: File[], onProgress?: (index: number, progress: number) => void): Promise<string[]>;
};

export { type Beneficiary, type CommentInput, type ComposerOptions, type ComposerResult, type VideoProgressCallback, type VideoUploadResult, appendMediaToBody, buildCommentOperation, buildCommentOptionsOperation, createSnapComposer, extractHashtags, extractVideoIdFromEmbedUrl, extractVideoThumbnail, generatePermlink, imageToMarkdown, imagesToMarkdown, set3SpeakThumbnail, uploadToIPFS, uploadVideoTo3Speak };
