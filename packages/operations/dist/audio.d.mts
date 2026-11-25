export { AudioQuota, UploadLimitError, UploadLimitInfo, audioMaxSeconds, audioTooLong, blockedByQuota, fetchAudioQuota, formatUploadLimitMessage, isUploadLimitError, readUploadLimit } from './limits.mjs';

/**
 * @snapie/operations/audio - Audio Upload Module
 *
 * Optional module for 3Speak audio upload integration.
 * Only import this if you need audio upload functionality.
 *
 * @example
 * ```typescript
 * import { uploadAudioTo3Speak } from '@snapie/operations/audio';
 *
 * const embedUrl = await uploadAudioTo3Speak(audioBlob, {
 *   apiKey: '...',
 *   owner: 'username',
 *   onProgress: (progress) => console.log(progress)
 * });
 * ```
 */

/**
 * Audio upload progress callback
 */
type AudioProgressCallback = (progress: number, status: 'uploading' | 'processing' | 'complete' | 'error') => void;
/**
 * Options for audio upload
 */
interface AudioUploadOptions {
    /** 3Speak API key */
    apiKey: string;
    /** Hive username of the uploader */
    owner: string;
    /** App name for metadata (default: "snapie") */
    appName?: string;
    /** Progress callback */
    onProgress?: AudioProgressCallback;
}
/**
 * Audio upload result
 */
interface AudioUploadResult {
    /** The play URL to include in posts */
    playUrl: string;
    /** The audio ID */
    audioId: string;
}
/**
 * Upload audio to 3Speak using TUS protocol
 *
 * @param file - Audio file or blob to upload
 * @param options - Upload options
 * @returns Promise resolving to play URL
 */
declare function uploadAudioTo3Speak(file: File | Blob, options: AudioUploadOptions): Promise<AudioUploadResult>;
/**
 * Extract audio ID from 3Speak play URL
 *
 * @example
 * // Input: "https://audio.3speak.tv/play?a=username/abc123"
 * // Output: "abc123"
 */
declare function extractAudioIdFromPlayUrl(playUrl: string): string | null;
/**
 * Record audio from microphone (browser only)
 *
 * @param options - Recording options
 * @returns Object with start, stop, and cancel methods
 */
declare function createAudioRecorder(options?: {
    /** Audio MIME type (default: 'audio/webm') */
    mimeType?: string;
    /** Callback when recording starts */
    onStart?: () => void;
    /** Callback with audio data chunks */
    onDataAvailable?: (chunk: Blob) => void;
    /** Callback when recording stops with final blob */
    onStop?: (blob: Blob) => void;
    /** Callback on error */
    onError?: (error: Error) => void;
}): {
    /**
     * Start recording audio
     */
    start(): Promise<void>;
    /**
     * Stop recording and get the audio blob
     */
    stop(): void;
    /**
     * Cancel recording without saving
     */
    cancel(): void;
    /**
     * Check if currently recording
     */
    isRecording(): boolean;
};

export { type AudioProgressCallback, type AudioUploadOptions, type AudioUploadResult, createAudioRecorder, extractAudioIdFromPlayUrl, uploadAudioTo3Speak };
