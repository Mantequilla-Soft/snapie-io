'use client';

/** Minimal shape of the File System Access API's picker surface — not yet
 *  in TypeScript's bundled DOM lib (checked: TS 5.9's lib.dom.d.ts has no
 *  showOpenFilePicker), so declared locally rather than pulling in a whole
 *  @types package for one method. */
interface FileSystemFileHandleLike {
    getFile(): Promise<File>;
}
declare global {
    interface Window {
        showOpenFilePicker?: (options?: {
            types?: { description?: string; accept: Record<string, string[]> }[];
            multiple?: boolean;
        }) => Promise<FileSystemFileHandleLike[]>;
    }
}

/**
 * Opens a video file picker and resolves with the chosen File, or null if
 * the user cancelled.
 *
 * Prefers the File System Access API (`showOpenFilePicker`) where available.
 * Plain `<input type="file">` on Android Chrome goes through Android's
 * ACTION_GET_CONTENT, which grants only a temporary read permission that
 * gallery/media providers don't always back with the file's full bytes —
 * confirmed live, repeatedly: video uploads picked this way failed with
 * NotReadableError on larger files no matter how the read was attempted
 * (whole-file read, small retried chunks, warming up via loadedmetadata,
 * even scrubbing the entire video's duration first). This is a known class
 * of Chromium/Android issue (see crbug.com/40123366) — Chromium's own fix
 * for it is routing file access through ACTION_OPEN_DOCUMENT instead, which
 * is exactly what `showOpenFilePicker` uses, with a persistent grant rather
 * than a fragile temporary one.
 *
 * Falls back to a plain `<input type="file">` wherever showOpenFilePicker
 * isn't available (iOS Safari, older Chrome, desktop browsers without it) —
 * desktop was never the affected path here either way.
 */
export async function pickVideoFile(): Promise<File | null> {
    if (typeof window !== 'undefined' && window.showOpenFilePicker) {
        try {
            const [handle] = await window.showOpenFilePicker({
                types: [{
                    description: 'Videos',
                    accept: {
                        'video/mp4': ['.mp4'],
                        'video/webm': ['.webm'],
                        'video/quicktime': ['.mov'],
                    },
                }],
                multiple: false,
            });
            return await handle.getFile();
        } catch (err) {
            // AbortError means the user cancelled the picker — that's a
            // real "no file chosen," not a reason to fall back and show a
            // second picker. Any other failure (feature-detected wrong,
            // permission denied, etc.) falls through to <input> below.
            if (err instanceof DOMException && err.name === 'AbortError') return null;
        }
    }

    return new Promise((resolve) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'video/mp4,video/webm,video/quicktime';
        input.onchange = () => resolve(input.files?.[0] ?? null);
        input.click();
    });
}
