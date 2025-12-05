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

import type { CommentOperation, CommentOptionsOperation, Operation } from '@hiveio/dhive';

// ============================================================================
// Types
// ============================================================================

/**
 * Configuration options for the composer
 */
export interface ComposerOptions {
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
export interface Beneficiary {
    account: string;
    /** Weight in basis points (100 = 1%, 1000 = 10%, 10000 = 100%) */
    weight: number;
}

/**
 * Input for building a comment/post
 */
export interface CommentInput {
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
export interface ComposerResult {
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
export type VideoProgressCallback = (progress: number, status: 'uploading' | 'processing' | 'complete' | 'error') => void;

/**
 * Video upload result
 */
export interface VideoUploadResult {
    embedUrl: string;
    videoId: string;
}

// ============================================================================
// Utilities
// ============================================================================

/**
 * Generate a unique permlink from current timestamp
 */
export function generatePermlink(): string {
    return new Date()
        .toISOString()
        .replace(/[^a-zA-Z0-9]/g, "")
        .toLowerCase();
}

/**
 * Extract hashtags from text content
 * 
 * @param text - Text to extract hashtags from
 * @returns Array of hashtag strings (without the # symbol)
 */
export function extractHashtags(text: string): string[] {
    const hashtagRegex = /#(\w+)/g;
    const matches = text.match(hashtagRegex) || [];
    return matches.map(hashtag => hashtag.slice(1));
}

/**
 * Build markdown image syntax from URL
 */
export function imageToMarkdown(url: string): string {
    return `![image](${url})`;
}

/**
 * Build markdown for multiple images
 */
export function imagesToMarkdown(urls: string[]): string {
    return urls.map(imageToMarkdown).join('\n');
}

/**
 * Append media embeds to body content
 */
export function appendMediaToBody(
    body: string,
    options: {
        images?: string[];
        gifUrl?: string;
        videoEmbedUrl?: string;
        audioEmbedUrl?: string;
    }
): string {
    let result = body;
    
    if (options.videoEmbedUrl) {
        result += `\n\n${options.videoEmbedUrl}`;
    }
    
    if (options.audioEmbedUrl) {
        result += `\n\n${options.audioEmbedUrl}`;
    }
    
    if (options.images && options.images.length > 0) {
        result += `\n\n${imagesToMarkdown(options.images)}`;
    }
    
    if (options.gifUrl) {
        result += `\n\n![gif](${options.gifUrl})`;
    }
    
    return result;
}

// ============================================================================
// Operation Builders
// ============================================================================

/**
 * Build a comment operation
 */
export function buildCommentOperation(input: {
    parentAuthor: string;
    parentPermlink: string;
    author: string;
    permlink: string;
    title: string;
    body: string;
    metadata: Record<string, unknown>;
}): CommentOperation {
    return [
        'comment',
        {
            parent_author: input.parentAuthor,
            parent_permlink: input.parentPermlink,
            author: input.author,
            permlink: input.permlink,
            title: input.title,
            body: input.body,
            json_metadata: JSON.stringify(input.metadata)
        }
    ];
}

/**
 * Build a comment_options operation (for beneficiaries, payout settings, etc.)
 */
export function buildCommentOptionsOperation(input: {
    author: string;
    permlink: string;
    maxAcceptedPayout?: string;
    percentHbd?: number;
    allowVotes?: boolean;
    allowCurationRewards?: boolean;
    beneficiaries?: Beneficiary[];
}): CommentOptionsOperation {
    const extensions: [0, { beneficiaries: { account: string; weight: number }[] }][] = [];
    
    if (input.beneficiaries && input.beneficiaries.length > 0) {
        // Sort beneficiaries alphabetically by account (required by Hive)
        const sortedBeneficiaries = [...input.beneficiaries].sort((a, b) => 
            a.account.localeCompare(b.account)
        );
        
        extensions.push([0, { beneficiaries: sortedBeneficiaries }]);
    }
    
    return [
        'comment_options',
        {
            author: input.author,
            permlink: input.permlink,
            max_accepted_payout: input.maxAcceptedPayout ?? '1000000.000 HBD',
            percent_hbd: input.percentHbd ?? 10000,
            allow_votes: input.allowVotes ?? true,
            allow_curation_rewards: input.allowCurationRewards ?? true,
            extensions
        }
    ];
}

// ============================================================================
// 3Speak Video Upload (TUS Protocol)
// ============================================================================

/**
 * Upload a video to 3Speak using TUS protocol
 * 
 * @param file - Video file to upload
 * @param options - Upload options
 * @returns Promise resolving to embed URL
 */
export async function uploadVideoTo3Speak(
    file: File,
    options: {
        apiKey: string;
        owner: string;
        appName?: string;
        onProgress?: VideoProgressCallback;
    }
): Promise<VideoUploadResult> {
    // Dynamic import to avoid bundling tus-js-client when not needed
    const tus = await import('tus-js-client');
    
    return new Promise((resolve, reject) => {
        let embedUrl: string | null = null;
        
        const upload = new tus.Upload(file, {
            endpoint: 'https://embed.3speak.tv/uploads',
            retryDelays: [0, 3000, 5000, 10000, 20000],
            metadata: {
                filename: file.name,
                owner: options.owner,
                frontend_app: options.appName ?? 'snapie',
                short: 'true'
            },
            headers: {
                'X-API-Key': options.apiKey
            },
            onError: (error) => {
                options.onProgress?.(0, 'error');
                reject(error);
            },
            onProgress: (bytesUploaded, bytesTotal) => {
                const percentage = (bytesUploaded / bytesTotal) * 100;
                options.onProgress?.(Math.round(percentage), 'uploading');
            },
            onAfterResponse: (req, res) => {
                const url = res.getHeader('X-Embed-URL');
                if (url) {
                    embedUrl = url;
                }
            },
            onSuccess: () => {
                if (embedUrl) {
                    options.onProgress?.(100, 'complete');
                    
                    // Extract video ID from embed URL
                    const videoId = extractVideoIdFromEmbedUrl(embedUrl);
                    
                    resolve({
                        embedUrl,
                        videoId: videoId ?? ''
                    });
                } else {
                    options.onProgress?.(0, 'error');
                    reject(new Error('Failed to get embed URL from server'));
                }
            }
        });
        
        upload.start();
    });
}

/**
 * Extract video ID from 3Speak embed URL
 * 
 * @example
 * // Input: "https://play.3speak.tv/embed?v=username/abc123"
 * // Output: "abc123"
 */
export function extractVideoIdFromEmbedUrl(embedUrl: string): string | null {
    try {
        const url = new URL(embedUrl);
        const videoParam = url.searchParams.get('v');
        if (videoParam) {
            const parts = videoParam.split('/');
            return parts[1] ?? null;
        }
        return null;
    } catch {
        return null;
    }
}

/**
 * Set thumbnail for a 3Speak video
 */
export async function set3SpeakThumbnail(
    videoId: string,
    thumbnailUrl: string,
    apiKey: string
): Promise<void> {
    const response = await fetch(`https://embed.3speak.tv/video/${videoId}/thumbnail`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-API-Key': apiKey
        },
        body: JSON.stringify({ thumbnail_url: thumbnailUrl })
    });
    
    if (!response.ok) {
        throw new Error(`Failed to set thumbnail: ${response.status} - ${response.statusText}`);
    }
}

/**
 * Upload a file to IPFS (3Speak supernode)
 */
export async function uploadToIPFS(
    file: File | Blob,
    endpoint: string = 'http://65.21.201.94:5002/api/v0/add'
): Promise<string> {
    const formData = new FormData();
    formData.append('file', file);
    
    const response = await fetch(endpoint, {
        method: 'POST',
        body: formData
    });
    
    if (!response.ok) {
        throw new Error(`IPFS upload failed: ${response.status} - ${response.statusText}`);
    }
    
    const responseText = await response.text();
    const lines = responseText.trim().split('\n');
    const lastLine = lines[lines.length - 1];
    const result = JSON.parse(lastLine);
    
    return `https://ipfs.3speak.tv/ipfs/${result.Hash}`;
}

// ============================================================================
// Thumbnail Extraction
// ============================================================================

/**
 * Extract a thumbnail frame from a video file
 * 
 * @param file - Video file
 * @param seekTime - Time in seconds to capture frame (default: 0.5)
 * @returns Promise resolving to thumbnail blob
 */
export async function extractVideoThumbnail(
    file: File,
    seekTime: number = 0.5
): Promise<Blob> {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const video = document.createElement('video');
        
        video.src = url;
        video.crossOrigin = 'anonymous';
        video.muted = true;
        
        video.addEventListener('loadeddata', () => {
            video.currentTime = seekTime;
        });
        
        video.addEventListener('seeked', () => {
            const canvas = document.createElement('canvas');
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            
            const ctx = canvas.getContext('2d');
            if (!ctx) {
                reject(new Error('Failed to get canvas context'));
                return;
            }
            
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            
            canvas.toBlob(
                (blob) => {
                    URL.revokeObjectURL(url);
                    if (blob) {
                        resolve(blob);
                    } else {
                        reject(new Error('Failed to create thumbnail blob'));
                    }
                },
                'image/jpeg',
                0.9
            );
        });
        
        video.addEventListener('error', () => {
            URL.revokeObjectURL(url);
            reject(new Error('Failed to load video'));
        });
        
        video.load();
    });
}

// ============================================================================
// Main Composer
// ============================================================================

/**
 * Default composer options
 */
const DEFAULT_OPTIONS: Required<Pick<ComposerOptions, 'appName' | 'defaultTags' | 'requireBeneficiariesOnVideo'>> = {
    appName: 'snapie',
    defaultTags: [],
    requireBeneficiariesOnVideo: false
};

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
export function createSnapComposer(options: ComposerOptions = {}) {
    const config = { ...DEFAULT_OPTIONS, ...options };
    
    return {
        /**
         * Build operations for a comment/post
         */
        buildOperations(input: CommentInput): ComposerResult {
            const permlink = input.permlink ?? generatePermlink();
            
            // Build body with media
            const body = appendMediaToBody(input.body, {
                images: input.images,
                gifUrl: input.gifUrl,
                videoEmbedUrl: input.videoEmbedUrl,
                audioEmbedUrl: input.audioEmbedUrl
            });
            
            // Extract and combine tags
            const extractedTags = extractHashtags(body);
            const allTags = [...new Set([
                ...config.defaultTags,
                ...(input.tags ?? []),
                ...extractedTags
            ])];
            
            // Build metadata
            const metadata: Record<string, unknown> = {
                app: config.appName,
                tags: allTags,
                ...(input.images && input.images.length > 0 ? { images: input.images } : {}),
                ...input.metadata
            };
            
            // Build comment operation
            const commentOp = buildCommentOperation({
                parentAuthor: input.parentAuthor,
                parentPermlink: input.parentPermlink,
                author: input.author,
                permlink,
                title: input.title ?? '',
                body,
                metadata
            });
            
            const operations: Operation[] = [commentOp];
            
            // Determine if we need comment_options (beneficiaries or custom payout settings)
            const beneficiaries = input.beneficiaries ?? config.beneficiaries;
            const hasCustomPayoutSettings = 
                input.maxAcceptedPayout !== undefined ||
                input.percentHbd !== undefined ||
                input.allowVotes !== undefined ||
                input.allowCurationRewards !== undefined;
            
            const needsBeneficiaries = beneficiaries && beneficiaries.length > 0;
            const requiresBeneficiaries = config.requireBeneficiariesOnVideo && input.videoEmbedUrl;
            
            if (needsBeneficiaries || hasCustomPayoutSettings || requiresBeneficiaries) {
                const optionsOp = buildCommentOptionsOperation({
                    author: input.author,
                    permlink,
                    maxAcceptedPayout: input.maxAcceptedPayout,
                    percentHbd: input.percentHbd,
                    allowVotes: input.allowVotes,
                    allowCurationRewards: input.allowCurationRewards,
                    beneficiaries: needsBeneficiaries ? beneficiaries : undefined
                });
                
                operations.push(optionsOp);
            }
            
            return {
                operations,
                permlink,
                body,
                metadata
            };
        },
        
        /**
         * Upload a video to 3Speak
         */
        async uploadVideo(
            file: File,
            owner: string,
            onProgress?: VideoProgressCallback
        ): Promise<VideoUploadResult> {
            if (!config.threeSpeakApiKey) {
                throw new Error('3Speak API key not configured');
            }
            
            return uploadVideoTo3Speak(file, {
                apiKey: config.threeSpeakApiKey,
                owner,
                appName: config.appName,
                onProgress
            });
        },
        
        /**
         * Extract and upload a video thumbnail
         */
        async uploadThumbnail(
            videoFile: File,
            uploadFn?: (blob: Blob) => Promise<string>
        ): Promise<string> {
            const thumbnailBlob = await extractVideoThumbnail(videoFile);
            
            if (uploadFn) {
                return uploadFn(thumbnailBlob);
            }
            
            // Default: upload to 3Speak IPFS
            return uploadToIPFS(
                thumbnailBlob,
                config.ipfsUploadEndpoint
            );
        },
        
        /**
         * Set video thumbnail via 3Speak API
         */
        async setVideoThumbnail(videoId: string, thumbnailUrl: string): Promise<void> {
            if (!config.threeSpeakApiKey) {
                throw new Error('3Speak API key not configured');
            }
            
            return set3SpeakThumbnail(videoId, thumbnailUrl, config.threeSpeakApiKey);
        },
        
        /**
         * Upload images (requires uploadImage function in config)
         */
        async uploadImages(
            files: File[],
            onProgress?: (index: number, progress: number) => void
        ): Promise<string[]> {
            if (!config.uploadImage) {
                throw new Error('uploadImage function not configured');
            }
            
            const results: string[] = [];
            
            for (let i = 0; i < files.length; i++) {
                const url = await config.uploadImage(
                    files[i],
                    (progress) => onProgress?.(i, progress)
                );
                results.push(url);
            }
            
            return results;
        }
    };
}

// ============================================================================
// Re-exports for convenience
// ============================================================================

export type {
    CommentOperation,
    CommentOptionsOperation,
    Operation
} from '@hiveio/dhive';
