// Client-side cache: permlink → translated text.
// Survives Snap remounts within the same browser session.
export const translationCache = new Map<string, string>();
