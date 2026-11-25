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

import { UploadLimitError, uploadLimitFromTusError } from './limits';

// Limit helpers live in ./limits; re-exported so audio callers need one import.
export {
    UploadLimitError,
    isUploadLimitError,
    readUploadLimit,
    fetchAudioQuota,
    blockedByQuota,
    audioMaxSeconds,
    audioTooLong,
    formatUploadLimitMessage,
    type UploadLimitInfo,
    type AudioQuota,
} from './limits';

/**
 * Audio upload progress callback
 */
export type AudioProgressCallback = (
    progress: number,
    status: 'uploading' | 'processing' | 'complete' | 'error'
) => void;

/**
 * Options for audio upload
 */
export interface AudioUploadOptions {
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
export interface AudioUploadResult {
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
export async function uploadAudioTo3Speak(
    file: File | Blob,
    options: AudioUploadOptions
): Promise<AudioUploadResult> {
    // Dynamic import to avoid bundling tus-js-client when not needed
    const tus = await import('tus-js-client');
    
    // Convert Blob to File if needed
    const audioFile = file instanceof File 
        ? file 
        : new File([file], `audio-${Date.now()}.webm`, { type: file.type });
    
    return new Promise((resolve, reject) => {
        let playUrl: string | null = null;
        
        const upload = new tus.Upload(audioFile, {
            endpoint: 'https://audio.3speak.tv/uploads',
            retryDelays: [0, 3000, 5000, 10000, 20000],
            metadata: {
                filename: audioFile.name,
                owner: options.owner,
                frontend_app: options.appName ?? 'snapie',
                filetype: audioFile.type || 'audio/webm'
            },
            headers: {
                'X-API-Key': options.apiKey
            },
            onError: (error) => {
                options.onProgress?.(0, 'error');
                // 429 daily_audio_limit / 413 audio_too_long: no retry, no fallback.
                const limit = uploadLimitFromTusError(error);
                reject(limit ? new UploadLimitError(limit) : error);
            },
            onProgress: (bytesUploaded, bytesTotal) => {
                const percentage = (bytesUploaded / bytesTotal) * 100;
                options.onProgress?.(Math.round(percentage), 'uploading');
            },
            onAfterResponse: (req, res) => {
                const url = res.getHeader('X-Play-URL');
                if (url) {
                    playUrl = url;
                }
            },
            onSuccess: () => {
                if (playUrl) {
                    options.onProgress?.(100, 'complete');
                    const audioId = extractAudioIdFromPlayUrl(playUrl);
                    resolve({
                        playUrl,
                        audioId: audioId ?? ''
                    });
                } else {
                    options.onProgress?.(0, 'error');
                    reject(new Error('Failed to get play URL from server'));
                }
            }
        });
        
        upload.start();
    });
}

/**
 * Extract audio ID from 3Speak play URL
 * 
 * @example
 * // Input: "https://audio.3speak.tv/play?a=username/abc123"
 * // Output: "abc123"
 */
export function extractAudioIdFromPlayUrl(playUrl: string): string | null {
    try {
        const url = new URL(playUrl);
        const audioParam = url.searchParams.get('a');
        if (audioParam) {
            const parts = audioParam.split('/');
            return parts[1] ?? null;
        }
        return null;
    } catch {
        return null;
    }
}

/**
 * Record audio from microphone (browser only)
 * 
 * @param options - Recording options
 * @returns Object with start, stop, and cancel methods
 */
export function createAudioRecorder(options?: {
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
}) {
    let mediaRecorder: MediaRecorder | null = null;
    let chunks: Blob[] = [];
    let stream: MediaStream | null = null;
    
    return {
        /**
         * Start recording audio
         */
        async start(): Promise<void> {
            try {
                stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                
                const mimeType = options?.mimeType ?? 'audio/webm';
                mediaRecorder = new MediaRecorder(stream, { mimeType });
                chunks = [];
                
                mediaRecorder.ondataavailable = (event) => {
                    if (event.data.size > 0) {
                        chunks.push(event.data);
                        options?.onDataAvailable?.(event.data);
                    }
                };
                
                mediaRecorder.onstop = () => {
                    const blob = new Blob(chunks, { type: mimeType });
                    options?.onStop?.(blob);
                    
                    // Clean up stream
                    stream?.getTracks().forEach(track => track.stop());
                    stream = null;
                };
                
                mediaRecorder.onerror = () => {
                    options?.onError?.(new Error('Recording failed'));
                };
                
                mediaRecorder.start(1000); // Collect data every second
                options?.onStart?.();
            } catch (error) {
                options?.onError?.(error instanceof Error ? error : new Error('Failed to start recording'));
            }
        },
        
        /**
         * Stop recording and get the audio blob
         */
        stop(): void {
            if (mediaRecorder && mediaRecorder.state !== 'inactive') {
                mediaRecorder.stop();
            }
        },
        
        /**
         * Cancel recording without saving
         */
        cancel(): void {
            if (mediaRecorder && mediaRecorder.state !== 'inactive') {
                mediaRecorder.stop();
            }
            chunks = [];
            stream?.getTracks().forEach(track => track.stop());
            stream = null;
        },
        
        /**
         * Check if currently recording
         */
        isRecording(): boolean {
            return mediaRecorder?.state === 'recording';
        }
    };
}
