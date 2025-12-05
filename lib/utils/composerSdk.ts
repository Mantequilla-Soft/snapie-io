/**
 * Snapie Composer SDK Integration
 * 
 * This file demonstrates how to use @snapie/composer SDK with the existing SnapComposer.
 * The SDK provides auth-agnostic utilities that can work with any authentication method.
 * 
 * @example
 * ```typescript
 * import { snapieComposer, buildSnapOperations } from './composerSdk';
 * 
 * // Build operations for a new snap
 * const result = await buildSnapOperations({
 *   author: 'username',
 *   body: 'Hello Hive! #test',
 *   parentPermlink: 'snaps-container-permlink',
 *   images: ['https://images.hive.blog/...'],
 *   videoEmbedUrl: 'https://play.3speak.tv/embed?v=...'
 * });
 * 
 * // Broadcast with Aioha (or any auth method)
 * await aioha.signAndBroadcastTx(result.operations, KeyTypes.Posting);
 * ```
 */

import { 
    createSnapComposer, 
    generatePermlink,
    extractHashtags,
    appendMediaToBody,
    buildCommentOperation,
    buildCommentOptionsOperation,
    uploadVideoTo3Speak,
    extractVideoThumbnail,
    uploadToIPFS,
    set3SpeakThumbnail,
    extractVideoIdFromEmbedUrl,
    type CommentInput,
    type ComposerResult,
    type VideoProgressCallback,
    type Beneficiary
} from '@snapie/composer';

import { getFileSignature, uploadImage } from '@/lib/hive/client-functions';

// ============================================================================
// Configured Composer Instance
// ============================================================================

/**
 * Pre-configured composer instance for Snapie.io
 * 
 * This includes:
 * - Default tags for the snaps community
 * - 3Speak API integration
 * - Image upload via Hive's image service
 */
export const snapieComposer = createSnapComposer({
    appName: 'mycommunity',
    defaultTags: [process.env.NEXT_PUBLIC_HIVE_COMMUNITY_TAG || '', 'snaps'],
    threeSpeakApiKey: process.env.NEXT_PUBLIC_3SPEAK_API_KEY,
    
    // Custom image upload function using Hive's image service
    uploadImage: async (file: File, onProgress?: (progress: number) => void) => {
        const signature = await getFileSignature(file);
        // Note: uploadImage from client-functions uses setUploadProgress which is a React setState
        // For SDK usage, we provide a simpler progress callback
        return uploadImage(file, signature);
    }
});

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Build operations for a snap post (simplified interface)
 */
export async function buildSnapOperations(input: {
    author: string;
    body: string;
    parentPermlink: string;
    images?: string[];
    gifUrl?: string;
    videoEmbedUrl?: string;
    audioEmbedUrl?: string;
    tags?: string[];
    /** Include beneficiaries (e.g., for video posts) */
    withBeneficiaries?: Beneficiary[];
}): Promise<ComposerResult> {
    return snapieComposer.buildOperations({
        author: input.author,
        body: input.body,
        parentAuthor: '',
        parentPermlink: input.parentPermlink,
        images: input.images,
        gifUrl: input.gifUrl,
        videoEmbedUrl: input.videoEmbedUrl,
        audioEmbedUrl: input.audioEmbedUrl,
        tags: input.tags,
        beneficiaries: input.withBeneficiaries
    });
}

/**
 * Upload video with thumbnail generation
 */
export async function uploadSnapVideo(
    file: File,
    owner: string,
    onProgress?: VideoProgressCallback
): Promise<{
    embedUrl: string;
    videoId: string;
    thumbnailUrl?: string;
}> {
    // Upload video
    const videoResult = await snapieComposer.uploadVideo(file, owner, onProgress);
    
    // Try to generate and upload thumbnail
    let thumbnailUrl: string | undefined;
    try {
        thumbnailUrl = await snapieComposer.uploadThumbnail(file);
        
        // Set the thumbnail on 3Speak
        if (videoResult.videoId && thumbnailUrl) {
            await snapieComposer.setVideoThumbnail(videoResult.videoId, thumbnailUrl);
        }
    } catch (error) {
        console.warn('Thumbnail generation/upload failed:', error);
    }
    
    return {
        ...videoResult,
        thumbnailUrl
    };
}

/**
 * Upload multiple images
 */
export async function uploadSnapImages(
    files: File[],
    onProgress?: (index: number, progress: number) => void
): Promise<string[]> {
    return snapieComposer.uploadImages(files, onProgress);
}

// ============================================================================
// Re-exports for convenience
// ============================================================================

export {
    generatePermlink,
    extractHashtags,
    appendMediaToBody,
    buildCommentOperation,
    buildCommentOptionsOperation,
    uploadVideoTo3Speak,
    extractVideoThumbnail,
    uploadToIPFS,
    set3SpeakThumbnail,
    extractVideoIdFromEmbedUrl
};

export type {
    CommentInput,
    ComposerResult,
    VideoProgressCallback,
    Beneficiary
};
