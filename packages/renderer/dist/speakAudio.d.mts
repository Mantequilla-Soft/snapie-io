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
declare function canonicalSpeakAudioUrl(url: string): string | null;

export { canonicalSpeakAudioUrl };
