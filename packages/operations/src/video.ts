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

const SERVICE_BASE = 'https://embed.3speak.tv';

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
    /** Mark upload as a short-form video (default: true). Pass false for long-form blog posts. */
    isShort?: boolean;
}

interface UploadTokenResponse {
    token: string;
    upload_url: string;
    permlink: string;
    embed_url: string;
    expires_at: string;
}

async function issueUploadToken(options: VideoUploadOptions): Promise<UploadTokenResponse> {
    const response = await fetch(`${SERVICE_BASE}/uploads/token`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-API-Key': options.apiKey,
        },
        body: JSON.stringify({
            owner: options.owner,
            app: options.appName ?? 'snapie',
            short: options.isShort !== false,
        }),
    });

    if (!response.ok) {
        throw new Error(`Failed to issue upload token: ${response.status} ${response.statusText}`);
    }

    return response.json();
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
    // Get a token upfront — this binds the permlink and gives us embed_url
    // before a single byte is transferred, eliminating the X-Embed-URL header
    // race that caused duplicate uploads under parallel TUS Concatenation.
    const { token, upload_url, embed_url } = await issueUploadToken(options);

    // Dynamic import to avoid bundling tus-js-client when not needed
    const tus = await import('tus-js-client');

    return new Promise((resolve, reject) => {
        const MB = 1024 * 1024;
        const fileSize = file.size;
        const chunkSize  = fileSize < 50  * MB ? 5  * MB
                         : fileSize < 500 * MB ? 10 * MB
                         :                       20 * MB;
        const parallelUploads = fileSize < 50 * MB ? 2 : 3;

        const upload = new tus.Upload(file, {
            endpoint: upload_url,
            chunkSize,
            parallelUploads,
            retryDelays: [0, 3000, 5000, 10000, 20000],
            metadata: {
                filename: file.name,
                filetype: file.type,
                // owner, app, short are bound in the token — no need to repeat them
            },
            headers: {
                'Authorization': `Bearer ${token}`,
            },
            onError: (error) => {
                options.onProgress?.(0, 'error');
                reject(error);
            },
            onProgress: (bytesUploaded, bytesTotal) => {
                const percentage = (bytesUploaded / bytesTotal) * 100;
                options.onProgress?.(Math.round(percentage), 'uploading');
            },
            onSuccess: () => {
                options.onProgress?.(100, 'complete');
                resolve({
                    embedUrl: embed_url,
                    videoId: extractVideoIdFromEmbedUrl(embed_url) ?? '',
                });
            },
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

        // Mobile Safari/WebKit routinely never fires loadeddata/seeked on a
        // video element that isn't attached to the document, and treats
        // crossOrigin on a local blob: URL as a reason to error the load out
        // entirely — both fail silently here since the caller swallows
        // rejections, so the post just ends up with no thumbnail. Mirror the
        // playsInline/muted setup used by every other <video> in this app and
        // keep the element (off-screen) in the DOM for the duration of capture.
        video.muted = true;
        video.playsInline = true;
        video.setAttribute('playsinline', 'true');
        video.setAttribute('webkit-playsinline', 'true');
        video.style.position = 'fixed';
        video.style.top = '-9999px';
        video.style.width = '1px';
        video.style.height = '1px';
        video.src = url;
        document.body.appendChild(video);

        const cleanup = () => {
            URL.revokeObjectURL(url);
            video.remove();
        };

        video.addEventListener('loadedmetadata', () => {
            const target = Math.min(seekTime, Math.max((video.duration || seekTime) - 0.05, 0));
            // iOS Safari needs a play() kick (allowed unprompted since muted)
            // before it will actually decode a frame to seek/draw from.
            video.play().catch(() => {}).finally(() => {
                video.pause();
                video.currentTime = target;
            });
        });

        video.addEventListener('seeked', () => {
            const canvas = document.createElement('canvas');
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;

            const ctx = canvas.getContext('2d');
            if (!ctx) {
                cleanup();
                reject(new Error('Failed to get canvas context'));
                return;
            }

            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

            canvas.toBlob(
                (blob) => {
                    cleanup();
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
            cleanup();
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
