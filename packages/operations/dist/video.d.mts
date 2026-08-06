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
 * Copy `file` into an in-memory File, read in small chunks.
 *
 * Android hands the browser a `content://` reference for gallery/camera
 * files rather than a real file handle, and reading it is unreliable —
 * confirmed live on Android Chrome two different ways: (1) a small 1 MB
 * slice read fine, but a *second* read of the same file threw
 * NotReadableError ("permission problems that have occurred after a
 * reference to a file was acquired"); (2) later, even a *single* whole-file
 * `file.arrayBuffer()` read failed outright on the very first attempt for a
 * different video. A single long-lived read of the whole file appears to be
 * the common failure mode — plausibly Android's content provider timing out
 * or revoking access mid-transfer, more likely the more recently the video
 * was recorded (MediaStore may still be finalizing it). Several short,
 * independent reads — proven to work in the first case above — avoid ever
 * holding one such read open for long, and each gets its own retry in case
 * the provider is only momentarily busy rather than truly gone.
 *
 * That unreliability breaks video upload two ways at once regardless of
 * which failure mode it hits — TUS re-reads the file chunk by chunk, and
 * thumbnail extraction opens it again in parallel — so uploads died at
 * offset 0 with a bare ProgressEvent and no HTTP response at all, while
 * images (read once, small) and desktop (real file handles) were fine.
 *
 * Reading once up front and passing the memory-backed copy to every consumer
 * sidesteps it entirely. Returns a File (not a Blob) so `.name`/`.type`
 * survive and callers need no changes; idempotent, so buffering twice on a
 * shared path costs nothing.
 */
declare function bufferFileInMemory(file: File): Promise<File>;
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

export { type VideoProgressCallback, type VideoUploadOptions, type VideoUploadResult, bufferFileInMemory, extractVideoIdFromEmbedUrl, extractVideoThumbnail, set3SpeakThumbnail, uploadToIPFS, uploadVideoTo3Speak, uploadVideoWithThumbnail };
