/**
 * 3Speak audio link helpers with no renderer dependencies.
 *
 * Kept apart from index.ts so client code that only needs the URL mapping
 * (`@snapie/renderer/speak-audio`) does not pull @hiveio/content-renderer,
 * DOMPurify and the markdown parser into its bundle. index.ts re-exports it.
 */

/**
 * Map a 3speak.tv audio or playlist share link to its audio.3speak.tv player URL.
 *   3speak.tv/audio?play=<owner>/<audioId>  →  https://audio.3speak.tv/play?a=<audioId>
 *   3speak.tv/playlist/<playlistId>         →  https://audio.3speak.tv/play?list=<playlistId>
 * The `?play=` id is the audio's own id, not the Hive post permlink.
 * Returns null for any other URL.
 */
export function canonicalSpeakAudioUrl(url: string): string | null {
    let u: URL;
    try {
        u = new URL(url.replace(/&amp;/gi, '&').trim());
    } catch {
        return null;
    }
    if (!/^(www\.)?3speak\.tv$/i.test(u.hostname)) return null;

    if (/^\/audio\/?$/.test(u.pathname)) {
        const id = u.searchParams.get('play')?.match(/^@?[a-z0-9.-]+\/([A-Za-z0-9-]+)$/i)?.[1];
        return id ? `https://audio.3speak.tv/play?a=${id}` : null;
    }
    const list = u.pathname.match(/^\/playlist\/([A-Za-z0-9-]{8,64})\/?$/)?.[1];
    return list ? `https://audio.3speak.tv/play?list=${list}` : null;
}
