/**
 * Snapie Operations SDK Integration
 * 
 * Pre-configured operation builder for Snapie.io using @snapie/operations SDK.
 * 
 * @example
 * ```typescript
 * import { snapieComposer } from '@/lib/utils/composerSdk';
 * 
 * const result = snapieComposer.build({
 *   author: 'username',
 *   body: 'Hello Hive! #test',
 *   parentAuthor: '',
 *   parentPermlink: 'snaps-container-permlink',
 * });
 * 
 * // Broadcast with Aioha
 * await aioha.signAndBroadcastTx(result.operations, KeyTypes.Posting);
 * ```
 */

// Core composer (no video/audio dependencies)
import { 
    createComposer,
    generatePermlink,
    extractHashtags,
    appendMediaToBody,
    buildCommentOperation,
    buildCommentOptionsOperation,
    type CommentInput,
    type ComposerResult,
    type Beneficiary
} from '@snapie/operations';

// Video module (optional - only imported where needed)
export {
    uploadVideoTo3Speak,
    uploadVideoWithThumbnail,
    extractVideoThumbnail,
    extractVideoIdFromEmbedUrl,
    set3SpeakThumbnail,
    uploadToIPFS,
    type VideoUploadOptions,
    type VideoUploadResult,
    type VideoProgressCallback
} from '@snapie/operations/video';

// Audio module (optional - only imported where needed)
export {
    uploadAudioTo3Speak,
    createAudioRecorder,
    extractAudioIdFromPlayUrl,
    type AudioUploadOptions,
    type AudioUploadResult,
    type AudioProgressCallback
} from '@snapie/operations/audio';

// ============================================================================
// Snapie.io Configured Composer
// ============================================================================

/**
 * Pre-configured composer instance for Snapie.io
 */
export const snapieComposer = createComposer({
    appName: 'mycommunity',
    defaultTags: [process.env.NEXT_PUBLIC_HIVE_COMMUNITY_TAG || '', 'snaps'].filter(Boolean),
});

/**
 * Composer with 10% beneficiaries for video posts
 */
export const snapieVideoComposer = createComposer({
    appName: 'mycommunity',
    defaultTags: [process.env.NEXT_PUBLIC_HIVE_COMMUNITY_TAG || '', 'snaps'].filter(Boolean),
    beneficiaries: [{ account: 'snapie', weight: 1000 }], // 10%
});

/**
 * Composer with 10% beneficiaries for hangout announcement snaps
 */
export const snapieHangoutComposer = createComposer({
    appName: 'mycommunity',
    defaultTags: [process.env.NEXT_PUBLIC_HIVE_COMMUNITY_TAG || '', 'snaps'].filter(Boolean),
    beneficiaries: [{ account: 'snapie', weight: 1000 }], // 10%
});

// ============================================================================
// Re-exports for convenience
// ============================================================================

export {
    createComposer,
    generatePermlink,
    extractHashtags,
    appendMediaToBody,
    buildCommentOperation,
    buildCommentOptionsOperation
};

export type {
    CommentInput,
    ComposerResult,
    Beneficiary
};
