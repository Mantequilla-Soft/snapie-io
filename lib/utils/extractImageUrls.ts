export function extractImageUrls(markdown: string): string[] {
    const markdownImageRegex = /!\[.*?\]\((.*?)\)/g;
    const plainImageRegex = /https?:\/\/[^\s"'<>]+\.(?:jpg|jpeg|png|gif|webp)(?:\?[^\s"'<>]*)?/gi;

    const matches: string[] = [];
    let match;

    while ((match = markdownImageRegex.exec(markdown)) !== null) {
        matches.push(match[1]);
    }

    // Fallback: also catch plain image URLs not wrapped in markdown syntax
    if (matches.length === 0) {
        while ((match = plainImageRegex.exec(markdown)) !== null) {
            matches.push(match[0]);
        }
    }

    return matches;
}