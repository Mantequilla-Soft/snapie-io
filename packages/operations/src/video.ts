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
export type VideoProgressCallback = (
    progress: number, 
    status: 'uploading' | 'processing' | 'complete' | 'error'
) => void;

/**
 * Video upload result
 */
export interface VideoUploadResult {
    /** The embed URL to include in posts */
    embedUrl: string;
    /** The video ID (permlink part) */
    videoId: string;
}

/**
 * Options for video upload
 */
export interface VideoUploadOptions {
    /** 3Speak API key */
    apiKey: string;
    /** Hive username of the uploader */
    owner: string;
    /** App name for metadata (default: "snapie") */
    appName?: string;
    /** Progress callback */
    onProgress?: VideoProgressCallback;
}

/**
 * Upload a video to 3Speak using TUS protocol
 * 
 * @param file - Video file to upload
 * @param options - Upload options
 * @returns Promise resolving to embed URL and video ID
 */
export async function uploadVideoTo3Speak(
    file: File,
    options: VideoUploadOptions
): Promise<VideoUploadResult> {
    // Dynamic import to avoid bundling tus-js-client when not needed
    const tus = await import('tus-js-client');
    
    return new Promise((resolve, reject) => {
        let embedUrl: string | null = null;
        
        const upload = new tus.Upload(file, {
            endpoint: 'https://embed.3speak.tv/uploads',
            chunkSize: 10 * 1024 * 1024, // 10MB chunks for reliable large file uploads
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
 * 
 * @param videoId - The video ID (permlink part, e.g., "abc123")
 * @param thumbnailUrl - URL of the thumbnail image
 * @param apiKey - 3Speak API key
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
 * Extract a thumbnail frame from a video file (browser only)
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

/**
 * Upload a file to IPFS (3Speak supernode)
 * 
 * @param file - File or Blob to upload
 * @param endpoint - IPFS API endpoint (default: 3Speak supernode)
 * @returns IPFS URL of the uploaded file
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

/**
 * Helper to upload video with automatic thumbnail generation
 * 
 * @param file - Video file
 * @param options - Upload options including API key
 * @returns Video upload result with optional thumbnail URL
 */
export async function uploadVideoWithThumbnail(
    file: File,
    options: VideoUploadOptions & { 
        /** Custom thumbnail upload function */
        uploadThumbnail?: (blob: Blob) => Promise<string>;
    }
): Promise<VideoUploadResult & { thumbnailUrl?: string }> {
    // Start video upload and thumbnail extraction in parallel
    const [videoResult, thumbnailBlob] = await Promise.all([
        uploadVideoTo3Speak(file, options),
        extractVideoThumbnail(file).catch(() => null)
    ]);
    
    let thumbnailUrl: string | undefined;
    
    if (thumbnailBlob) {
        try {
            // Upload thumbnail
            thumbnailUrl = options.uploadThumbnail 
                ? await options.uploadThumbnail(thumbnailBlob)
                : await uploadToIPFS(thumbnailBlob);
            
            // Set it on 3Speak
            if (videoResult.videoId) {
                await set3SpeakThumbnail(videoResult.videoId, thumbnailUrl, options.apiKey);
            }
        } catch (error) {
            console.warn('Thumbnail processing failed (video still works):', error);
        }
    }
    
    return {
        ...videoResult,
        thumbnailUrl
    };
}
