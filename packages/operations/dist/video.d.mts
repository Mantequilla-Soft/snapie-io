/**
 * @snapie/operations/video - Video Upload Module
 *
 * Optional module for 3Speak video upload integration.
 * Only import this if you need video upload functionality.
 *
 * @example
 * ```typescript
 * import { uploadVideoTo3Speak } from '@snapie/operations/video';
 *
 * const result = await uploadVideoTo3Speak(file, {
 *   apiKey: '...',
 *   owner: 'username',
 *   onProgress: (progress, status) => console.log(progress, status)
 * });
 *
 * console.log(result.embedUrl);
 * ```
 */
/**
 * Video upload progress callback
 */
type VideoProgressCallback = (progress: number, status: 'uploading' | 'processing' | 'complete' | 'error') => void;
/**
 * Video upload result
 */
interface VideoUploadResult {
    /** The embed URL to include in posts */
    embedUrl: string;
    /** The video ID (permlink part) */
    videoId: string;
}
/**
 * Options for video upload
 */
interface VideoUploadOptions {
    /** 3Speak API key */
    apiKey: string;
    /** Hive username of the uploader */
    owner: string;
    /** App name for metadata (default: "snapie") */
    appName?: string;
    /** Progress callback */
    onProgress?: VideoProgressCallback;
    /** Mark upload as a short-form video (default: true). Pass false for long-form blog posts. */
    isShort?: boolean;
}
/**
 * Upload a video to 3Speak using TUS protocol
 *
 * @param file - Video file to upload
 * @param options - Upload options
 * @returns Promise resolving to embed URL and video ID
 */
declare function uploadVideoTo3Speak(file: File, options: VideoUploadOptions): Promise<VideoUploadResult>;
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
 *
 * @param videoId - The video ID (permlink part, e.g., "abc123")
 * @param thumbnailUrl - URL of the thumbnail image
 * @param apiKey - 3Speak API key
 */
declare function set3SpeakThumbnail(videoId: string, thumbnailUrl: string, apiKey: string): Promise<void>;
/**
 * Extract a thumbnail frame from a video file (browser only)
 *
 * @param file - Video file
 * @param seekTime - Time in seconds to capture frame (default: 0.5)
 * @returns Promise resolving to thumbnail blob
 */
declare function extractVideoThumbnail(file: File, seekTime?: number): Promise<Blob>;
/**
 * Upload a file to IPFS (3Speak supernode)
 *
 * @param file - File or Blob to upload
 * @param endpoint - IPFS API endpoint (default: 3Speak supernode)
 * @returns IPFS URL of the uploaded file
 */
declare function uploadToIPFS(file: File | Blob, endpoint?: string): Promise<string>;
/**
 * Helper to upload video with automatic thumbnail generation
 *
 * @param file - Video file
 * @param options - Upload options including API key
 * @returns Video upload result with optional thumbnail URL
 */
declare function uploadVideoWithThumbnail(file: File, options: VideoUploadOptions & {
    /** Custom thumbnail upload function */
    uploadThumbnail?: (blob: Blob) => Promise<string>;
}): Promise<VideoUploadResult & {
    thumbnailUrl?: string;
}>;

export { type VideoProgressCallback, type VideoUploadOptions, type VideoUploadResult, extractVideoIdFromEmbedUrl, extractVideoThumbnail, set3SpeakThumbnail, uploadToIPFS, uploadVideoTo3Speak, uploadVideoWithThumbnail };
