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

const PLAYBACK_API_BASE = 'https://play.3speak.tv';
const READY_POLL_INTERVAL_MS = 3000;
const READY_POLL_TIMEOUT_MS = 120_000;

/**
 * TUS's onSuccess only means the raw bytes were fully received — 3Speak
 * transcodes the video into something playable *afterward*, asynchronously.
 * Treating byte-transfer completion as "the video is ready" is how a video
 * can finish "uploading" from the client's perspective while never actually
 * becoming playable (silently stuck processing, or failing to transcode
 * altogether) — confirmed live: a correctly-sized, on-device video recorded
 * fresh for testing still hit this. Poll the same metadata endpoint the
 * player itself uses (play.3speak.tv/api/embed) until a real playable URL
 * shows up, instead of trusting the TUS callback alone.
 */
async function waitForVideoReady(owner: string, videoId: string): Promise<void> {
    const deadline = Date.now() + READY_POLL_TIMEOUT_MS;

    while (Date.now() < deadline) {
        // A network hiccup mid-poll (fetch throwing, a non-JSON response,
        // etc.) shouldn't end the whole attempt — only a definitive
        // processing failure reported by 3Speak itself should.
        const outcome = await fetch(`${PLAYBACK_API_BASE}/api/embed?v=${owner}/${videoId}`)
            .then(async (res) => {
                if (!res.ok) return { ready: false } as const;
                const data = await res.json();
                if (!data.error && data.videoUrl) return { ready: true } as const;
                if (data.status === 'error' || data.status === 'failed') {
                    return { ready: false, failure: data.error || 'Video processing failed on 3Speak.' } as const;
                }
                return { ready: false } as const;
            })
            .catch(() => ({ ready: false }) as const);

        if (outcome.ready) return;
        if ('failure' in outcome) throw new Error(outcome.failure);

        await new Promise(r => setTimeout(r, READY_POLL_INTERVAL_MS));
    }

    throw new Error('Video is taking longer than usual to process. It may still appear shortly — check back in a minute before trying again.');
}

/** Files this module has already copied into memory — see bufferFileInMemory.
 *  Weak so a buffered copy going out of scope is still collectable. */
const bufferedFiles = new WeakSet<Blob>();

/** Above this, don't attempt to hold the whole file in memory. Only desktop
 *  realistically uploads files this big (the blog composer allows 500 MB),
 *  and desktop doesn't have the Android re-read problem this works around. */
const MAX_BUFFER_BYTES = 200 * 1024 * 1024;

/**
 * Briefly loads `file` into an off-screen <video> element and waits for its
 * metadata, without extracting anything — confirmed live: a user working
 * around the Android read failures found that tapping "Preview" on the
 * video in the system file picker before hitting "Done" reliably fixed the
 * upload, every time. Actually opening/decoding the file appears to force
 * Android to fully materialize the underlying content:// reference, which
 * a plain byte read never does. This does programmatically what that manual
 * preview does, before bufferFileInMemory ever tries to read the bytes.
 *
 * Best-effort: if the video never fires loadedmetadata (or errors), this
 * still resolves after a short timeout rather than blocking the upload —
 * the chunked read + retry in bufferFileInMemory is the real safety net if
 * warming up doesn't fully help.
 */
async function warmUpVideoFile(file: File): Promise<void> {
    const t0 = Date.now();
    return new Promise((resolve) => {
        const url = URL.createObjectURL(file);
        const video = document.createElement('video');
        video.muted = true;
        video.playsInline = true;
        video.setAttribute('playsinline', 'true');
        video.setAttribute('webkit-playsinline', 'true');
        video.style.position = 'fixed';
        video.style.top = '-9999px';
        video.style.width = '1px';
        video.style.height = '1px';

        let done = false;
        const finish = (reason: 'loadedmetadata' | 'error' | 'timeout') => {
            if (done) return;
            done = true;
            clearTimeout(timeout);
            URL.revokeObjectURL(url);
            video.remove();
            // eslint-disable-next-line no-console
            console.log(`[video-buffer] warm-up finished: ${reason} after ${Date.now() - t0}ms`);
            resolve();
        };
        const timeout = setTimeout(() => finish('timeout'), 5000);

        video.addEventListener('loadedmetadata', () => finish('loadedmetadata'), { once: true });
        video.addEventListener('error', () => finish('error'), { once: true });
        video.src = url;
        document.body.appendChild(video);
    });
}

/** Read size for bufferFileInMemory's chunked pass. Small enough that each
 *  individual read completes quickly rather than holding one long-lived
 *  stream open — see the function doc for why that distinction matters on
 *  Android. */
const READ_CHUNK_BYTES = 2 * 1024 * 1024;

/** A failed chunk read is retried this many times (short delay between
 *  attempts) before giving up — Android's content provider can be
 *  momentarily busy (e.g. MediaStore still finalizing a just-recorded
 *  video) rather than permanently unreadable. */
const READ_RETRIES = 2;

async function readChunkWithRetry(file: File, start: number, end: number): Promise<ArrayBuffer> {
    for (let attempt = 0; ; attempt++) {
        const t0 = Date.now();
        try {
            const buf = await file.slice(start, end).arrayBuffer();
            // eslint-disable-next-line no-console
            console.log(`[video-buffer] chunk ${start}-${end} ok on attempt ${attempt + 1} (${Date.now() - t0}ms, ${buf.byteLength}B)`);
            return buf;
        } catch (err) {
            const name = err instanceof DOMException ? err.name : (err instanceof Error ? err.constructor.name : typeof err);
            const msg = err instanceof Error ? err.message : String(err);
            // eslint-disable-next-line no-console
            console.log(`[video-buffer] chunk ${start}-${end} FAILED attempt ${attempt + 1} after ${Date.now() - t0}ms: ${name}: ${msg}`);
            if (attempt >= READ_RETRIES) throw err;
            await new Promise(r => setTimeout(r, 300));
        }
    }
}

/**
 * Copy `file` into an in-memory File: first warm it up by actually opening
 * it (see warmUpVideoFile), then read it in small chunks.
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
export async function bufferFileInMemory(file: File): Promise<File> {
    if (bufferedFiles.has(file) || file.size > MAX_BUFFER_BYTES) return file;

    // eslint-disable-next-line no-console
    console.log(`[video-buffer] start: name=${file.name} size=${file.size} type=${JSON.stringify(file.type)} lastModified=${file.lastModified}`);

    await warmUpVideoFile(file);

    const chunks: ArrayBuffer[] = [];
    const t0 = Date.now();
    try {
        for (let start = 0; start < file.size; start += READ_CHUNK_BYTES) {
            chunks.push(await readChunkWithRetry(file, start, Math.min(start + READ_CHUNK_BYTES, file.size)));
        }
        // An empty/zero-byte selection reads as zero chunks above — still
        // worth surfacing as the same friendly error rather than silently
        // uploading nothing.
        if (chunks.length === 0 && file.size > 0) throw new Error('no chunks read');
        // eslint-disable-next-line no-console
        console.log(`[video-buffer] all ${chunks.length} chunks read in ${Date.now() - t0}ms`);
    } catch (err) {
        // eslint-disable-next-line no-console
        console.log(`[video-buffer] gave up after ${Date.now() - t0}ms, ${chunks.length} chunks read:`, err);
        throw new Error(
            "Couldn't read the selected video. On Android this usually means the file lives in cloud storage (Google Photos, Drive) rather than on the device — open it in your gallery to download it locally first, then try again."
        );
    }

    const copy = new File(chunks, file.name, { type: file.type });
    bufferedFiles.add(copy);
    return copy;
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
    // TUS reads the file repeatedly (chunk by chunk, and in parallel) — on
    // Android that re-read is exactly what fails. Buffer first; idempotent,
    // so callers that already buffered pay nothing.
    const source = await bufferFileInMemory(file);

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

        const upload = new tus.Upload(source, {
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
                options.onProgress?.(100, 'processing');
                const videoId = extractVideoIdFromEmbedUrl(embed_url) ?? '';
                waitForVideoReady(options.owner, videoId)
                    .then(() => {
                        options.onProgress?.(100, 'complete');
                        resolve({ embedUrl: embed_url, videoId });
                    })
                    .catch((err) => {
                        options.onProgress?.(0, 'error');
                        reject(err);
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
    // Buffer once, up front — the upload and the thumbnail extraction below
    // both read this file, in parallel, and on Android a second read of the
    // original `content://`-backed File fails outright (see
    // bufferFileInMemory). Sharing one memory-backed copy means neither
    // consumer ever touches the original again.
    const source = await bufferFileInMemory(file);

    // Start video upload and thumbnail extraction in parallel
    const [videoResult, thumbnailBlob] = await Promise.all([
        uploadVideoTo3Speak(source, options),
        extractVideoThumbnail(source).catch(() => null)
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
