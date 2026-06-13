const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif'];

export function isImageUrl(url: string): boolean {
  const trimmed = url.trim();
  try {
    const parsed = new URL(trimmed);
    if (!['http:', 'https:'].includes(parsed.protocol)) return false;
    const pathname = parsed.pathname.toLowerCase();
    return IMAGE_EXTENSIONS.some(ext => pathname.endsWith(ext));
  } catch {
    return false;
  }
}

/**
 * Extract image URLs embedded in a message's content string.
 * Snapie sends images by embedding the URL as plain text in `message.content`.
 * Use this to detect and render inline images.
 *
 * @example
 * const images = extractImageUrls(message.content);
 * images.forEach(url => console.log(<img src={url} />));
 */
export function extractImageUrls(content: string): string[] {
  if (!content) return [];
  const urls = content.match(/https?:\/\/[^\s)]+/gi) ?? [];
  return urls.filter(isImageUrl);
}
