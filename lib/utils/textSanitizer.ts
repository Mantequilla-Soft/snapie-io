/**
 * Text Sanitizer Utility
 * 
 * Removes invisible Unicode control characters that can break layout
 * Common issues: LRM (U+200E), RLM (U+200F), zero-width spaces, etc.
 */

/**
 * Sanitizes text by removing invisible Unicode control characters
 * that can cause layout issues in HTML rendering
 * 
 * @param text - Raw text content
 * @returns Sanitized text with control characters removed
 */
export function sanitizeInvisibleCharacters(text: string): string {
  if (!text) return text;
  
  return text
    // Remove Left-to-Right Mark (U+200E)
    .replace(/\u200E/g, '')
    // Remove Right-to-Left Mark (U+200F)
    .replace(/\u200F/g, '')
    // Remove Zero Width Space (U+200B)
    .replace(/\u200B/g, '')
    // Remove Zero Width Non-Joiner (U+200C)
    .replace(/\u200C/g, '')
    // Remove Zero Width Joiner (U+200D)
    .replace(/\u200D/g, '')
    // Remove Word Joiner (U+2060)
    .replace(/\u2060/g, '')
    // Remove Byte Order Mark (U+FEFF) / Zero Width No-Break Space
    .replace(/\uFEFF/g, '')
    // Remove other common invisible characters
    .replace(/[\u180E\u2000-\u200A\u202F\u205F]/g, '');
}

/**
 * More aggressive sanitization that also normalizes whitespace
 * Use this if you need additional cleanup
 * 
 * @param text - Raw text content
 * @returns Sanitized and normalized text
 */
export function sanitizeAndNormalizeText(text: string): string {
  if (!text) return text;
  
  return sanitizeInvisibleCharacters(text)
    // Normalize multiple spaces to single space
    .replace(/  +/g, ' ')
    // Normalize line endings to Unix style
    .replace(/\r\n/g, '\n')
    // Remove trailing whitespace from lines
    .replace(/[^\S\n]+$/gm, '');
}
