/**
 * Utility functions for the blog post composer
 * Based on SkateHive's compose utilities
 */

/**
 * Generate a Hive-compatible permlink from a title
 * Rules:
 * - Lowercase only
 * - Replace spaces and special chars with hyphens
 * - Remove consecutive hyphens
 * - Max 255 characters
 * - Add timestamp suffix for uniqueness
 */
export function generatePermlink(title: string): string {
    if (!title || title.trim() === '') {
        // If no title, use timestamp-based permlink
        return `post-${Date.now()}`;
    }

    // Convert to lowercase and replace spaces with hyphens
    let permlink = title
        .toLowerCase()
        .trim()
        // Replace spaces and underscores with hyphens
        .replace(/[\s_]+/g, '-')
        // Remove all non-alphanumeric characters except hyphens
        .replace(/[^a-z0-9-]/g, '')
        // Remove consecutive hyphens
        .replace(/-+/g, '-')
        // Remove leading/trailing hyphens
        .replace(/^-+|-+$/g, '');

    // Add timestamp suffix for uniqueness (last 6 digits of timestamp)
    const timestamp = Date.now().toString().slice(-6);
    permlink = `${permlink}-${timestamp}`;

    // Ensure it doesn't exceed Hive's 255 character limit
    if (permlink.length > 255) {
        permlink = permlink.substring(0, 249) + '-' + timestamp;
    }

    return permlink;
}

/**
 * Extract all image URLs from markdown content
 * Returns array of URLs in order of appearance
 */
export function extractImageUrls(markdown: string): string[] {
    const imageUrls: string[] = [];
    
    // Match markdown images: ![alt](url)
    const markdownImageRegex = /!\[.*?\]\((https?:\/\/[^\s)]+)\)/g;
    let match;
    
    while ((match = markdownImageRegex.exec(markdown)) !== null) {
        imageUrls.push(match[1]);
    }
    
    // Match HTML img tags: <img src="url">
    const htmlImageRegex = /<img[^>]+src=["']([^"']+)["']/gi;
    while ((match = htmlImageRegex.exec(markdown)) !== null) {
        imageUrls.push(match[1]);
    }
    
    return imageUrls;
}

/**
 * Prepare image array for Hive post metadata
 * First image becomes the thumbnail
 */
export function prepareImageArray(markdown: string, selectedThumbnail: string | null = null): string[] {
    const images = extractImageUrls(markdown);
    
    if (selectedThumbnail && !images.includes(selectedThumbnail)) {
        // If a specific thumbnail is selected, put it first
        return [selectedThumbnail, ...images];
    }
    
    return images;
}

/**
 * Insert content at the cursor position in a textarea
 */
export function insertAtCursor(
    textarea: HTMLTextAreaElement,
    textToInsert: string,
    markdown: string,
    setMarkdown: (value: string) => void
): void {
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    
    const newMarkdown = 
        markdown.substring(0, start) + 
        textToInsert + 
        markdown.substring(end);
    
    setMarkdown(newMarkdown);
    
    // Restore cursor position after the inserted text
    setTimeout(() => {
        textarea.focus();
        const newPosition = start + textToInsert.length;
        textarea.setSelectionRange(newPosition, newPosition);
    }, 0);
}

/**
 * Compress an image file before upload
 * Reduces file size while maintaining reasonable quality
 */
export async function compressImage(file: File, maxWidth: number = 1920, quality: number = 0.8): Promise<File> {
    // drawImage + toBlob('image/jpeg') keeps a single frame. An animated GIF
    // uploaded through that path is a still. Return the original bytes.
    if (file.type === 'image/gif') return file;

    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        
        reader.onload = (e) => {
            const img = new Image();
            
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;
                
                // Calculate new dimensions
                if (width > maxWidth) {
                    height = (height * maxWidth) / width;
                    width = maxWidth;
                }
                
                canvas.width = width;
                canvas.height = height;
                
                const ctx = canvas.getContext('2d');
                if (!ctx) {
                    reject(new Error('Failed to get canvas context'));
                    return;
                }
                
                // Draw and compress
                ctx.drawImage(img, 0, 0, width, height);
                
                canvas.toBlob(
                    (blob) => {
                        if (!blob) {
                            reject(new Error('Failed to compress image'));
                            return;
                        }
                        
                        // Create a new File object with the compressed blob
                        const compressedFile = new File([blob], file.name, {
                            type: 'image/jpeg',
                            lastModified: Date.now(),
                        });
                        
                        console.log(`Image compressed: ${(file.size / 1024).toFixed(2)}KB -> ${(compressedFile.size / 1024).toFixed(2)}KB`);
                        resolve(compressedFile);
                    },
                    'image/jpeg',
                    quality
                );
            };
            
            img.onerror = () => reject(new Error('Failed to load image'));
            img.src = e.target?.result as string;
        };
        
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsDataURL(file);
    });
}

/**
 * Validate if a title is suitable for a Hive post
 */
export function validateTitle(title: string): { valid: boolean; error?: string } {
    if (!title || title.trim() === '') {
        return { valid: false, error: 'Title is required' };
    }
    
    if (title.length < 3) {
        return { valid: false, error: 'Title must be at least 3 characters' };
    }
    
    if (title.length > 255) {
        return { valid: false, error: 'Title must be less than 255 characters' };
    }
    
    return { valid: true };
}

/**
 * Validate markdown content
 */
export function validateContent(markdown: string): { valid: boolean; error?: string } {
    if (!markdown || markdown.trim() === '') {
        return { valid: false, error: 'Post content is required' };
    }
    
    if (markdown.length < 10) {
        return { valid: false, error: 'Post content is too short' };
    }
    
    // Hive has a max post size of 64KB
    if (new Blob([markdown]).size > 65536) {
        return { valid: false, error: 'Post content is too large (max 64KB)' };
    }
    
    return { valid: true };
}
