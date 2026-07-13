/**
 * Word count / reading time estimates, shared by the compose editor and
 * the blog post view so both report the same numbers.
 */

const WORDS_PER_MINUTE = 200;

/** Strips markdown/HTML syntax down to plain text for counting or translation. */
export function stripMarkdownToPlainText(markdown: string): string {
    return markdown
        .replace(/!\[.*?\]\(.*?\)/g, '')
        .replace(/\[([^\]]*)\]\(.*?\)/g, '$1')
        .replace(/<[^>]+>/g, ' ')
        .replace(/https?:\/\/\S+/g, '')
        .replace(/#{1,6}\s/g, '')
        .replace(/[*_~`]/g, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

export function getWordCount(markdown: string): number {
    const text = stripMarkdownToPlainText(markdown);
    if (!text) return 0;
    return text.split(/\s+/).filter(Boolean).length;
}

export function getReadingTimeMinutes(wordCount: number): number {
    if (wordCount === 0) return 0;
    return Math.max(1, Math.round(wordCount / WORDS_PER_MINUTE));
}
