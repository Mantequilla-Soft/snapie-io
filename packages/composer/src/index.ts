/**
 * @snapie/composer
 * 
 * Rich markdown editor utilities for Hive blockchain content creation.
 * 
 * This package provides two layers:
 * 
 * ## Core Utilities (Framework-Agnostic)
 * 
 * Pure functions for markdown manipulation that work anywhere:
 * 
 * ```typescript
 * import { insertBold, insertImage, insertLink } from '@snapie/composer';
 * 
 * // These return { text, cursorPosition } - you handle the UI
 * const result = insertBold('Hello world', { start: 0, end: 5 });
 * // result.text = '**Hello** world'
 * // result.cursorPosition = 9
 * ```
 * 
 * ## React Components (Optional)
 * 
 * Pre-built React components with Chakra UI:
 * 
 * ```typescript
 * import { MarkdownEditor, EditorToolbar } from '@snapie/composer/react';
 * 
 * <MarkdownEditor
 *   value={markdown}
 *   onChange={setMarkdown}
 *   onImageUpload={uploadToHive}
 * />
 * ```
 * 
 * @packageDocumentation
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Selection range in text
 */
export interface TextSelection {
    /** Start position (0-indexed) */
    start: number;
    /** End position (0-indexed) */
    end: number;
}

/**
 * Result of a markdown insertion operation
 */
export interface InsertResult {
    /** The modified text */
    text: string;
    /** Where to place the cursor after insertion */
    cursorPosition: number;
    /** Optional selection range (for selecting inserted text) */
    selection?: TextSelection;
}

/**
 * Common emoji categories for quick access
 */
export const COMMON_EMOJIS = {
    reactions: ['😊', '😂', '❤️', '👍', '👎', '🔥', '💯', '🎉', '😍', '🤔'],
    expressions: ['😢', '😎', '🙄', '😴', '🤗', '🤩', '😬', '😱', '🤯', '😇'],
    symbols: ['🚀', '⭐', '💪', '👏', '🙌', '🤝', '💰', '📈', '📉', '💎'],
} as const;

/**
 * Flattened list of all common emojis
 */
export const ALL_COMMON_EMOJIS = [
    ...COMMON_EMOJIS.reactions,
    ...COMMON_EMOJIS.expressions,
    ...COMMON_EMOJIS.symbols,
];

// ============================================================================
// Text Formatting
// ============================================================================

/**
 * Wrap selected text with bold markers
 * 
 * @example
 * ```typescript
 * const result = insertBold('Hello world', { start: 0, end: 5 });
 * // result.text = '**Hello** world'
 * ```
 */
export function insertBold(text: string, selection: TextSelection): InsertResult {
    return wrapSelection(text, selection, '**', '**');
}

/**
 * Wrap selected text with italic markers
 */
export function insertItalic(text: string, selection: TextSelection): InsertResult {
    return wrapSelection(text, selection, '*', '*');
}

/**
 * Wrap selected text with underline HTML tags
 */
export function insertUnderline(text: string, selection: TextSelection): InsertResult {
    return wrapSelection(text, selection, '<u>', '</u>');
}

/**
 * Wrap selected text with strikethrough markers
 */
export function insertStrikethrough(text: string, selection: TextSelection): InsertResult {
    return wrapSelection(text, selection, '~~', '~~');
}

/**
 * Wrap selected text with inline code markers
 */
export function insertInlineCode(text: string, selection: TextSelection): InsertResult {
    return wrapSelection(text, selection, '`', '`');
}

// ============================================================================
// Block Elements
// ============================================================================

/**
 * Insert a link at cursor/selection
 * If text is selected, it becomes the link text
 */
export function insertLink(
    text: string, 
    selection: TextSelection, 
    url: string = 'url'
): InsertResult {
    const selectedText = text.substring(selection.start, selection.end) || 'link text';
    const linkMarkdown = `[${selectedText}](${url})`;
    
    const newText = text.substring(0, selection.start) + linkMarkdown + text.substring(selection.end);
    
    // Position cursor at the URL part for easy editing
    const urlStart = selection.start + selectedText.length + 3; // [text](
    const urlEnd = urlStart + url.length;
    
    return {
        text: newText,
        cursorPosition: urlEnd + 1, // After the closing )
        selection: { start: urlStart, end: urlEnd }
    };
}

/**
 * Insert an image at cursor
 */
export function insertImage(
    text: string, 
    selection: TextSelection, 
    url: string,
    altText: string = 'image'
): InsertResult {
    const imageMarkdown = `![${altText}](${url})`;
    const newText = text.substring(0, selection.start) + imageMarkdown + text.substring(selection.end);
    
    return {
        text: newText,
        cursorPosition: selection.start + imageMarkdown.length,
    };
}

/**
 * Insert a code block
 */
export function insertCodeBlock(
    text: string, 
    selection: TextSelection, 
    language: string = ''
): InsertResult {
    const selectedText = text.substring(selection.start, selection.end) || 'code here';
    const codeBlock = `\`\`\`${language}\n${selectedText}\n\`\`\``;
    
    const newText = text.substring(0, selection.start) + codeBlock + text.substring(selection.end);
    
    // Position cursor inside the code block
    const codeStart = selection.start + 3 + language.length + 1; // ```lang\n
    
    return {
        text: newText,
        cursorPosition: codeStart + selectedText.length,
        selection: { start: codeStart, end: codeStart + selectedText.length }
    };
}

/**
 * Insert a blockquote
 */
export function insertBlockquote(text: string, selection: TextSelection): InsertResult {
    return insertAtLineStart(text, selection, '> ');
}

/**
 * Insert a bullet list item
 */
export function insertBulletList(text: string, selection: TextSelection): InsertResult {
    return insertAtLineStart(text, selection, '- ');
}

/**
 * Insert a numbered list item
 */
export function insertNumberedList(text: string, selection: TextSelection): InsertResult {
    return insertAtLineStart(text, selection, '1. ');
}

// ============================================================================
// Headers
// ============================================================================

/**
 * Insert a header at the specified level (1-6)
 */
export function insertHeader(
    text: string, 
    selection: TextSelection, 
    level: 1 | 2 | 3 | 4 | 5 | 6
): InsertResult {
    const prefix = '#'.repeat(level) + ' ';
    return insertAtLineStart(text, selection, prefix);
}

/**
 * Convenience functions for specific header levels
 */
export const insertH1 = (text: string, sel: TextSelection) => insertHeader(text, sel, 1);
export const insertH2 = (text: string, sel: TextSelection) => insertHeader(text, sel, 2);
export const insertH3 = (text: string, sel: TextSelection) => insertHeader(text, sel, 3);
export const insertH4 = (text: string, sel: TextSelection) => insertHeader(text, sel, 4);
export const insertH5 = (text: string, sel: TextSelection) => insertHeader(text, sel, 5);
export const insertH6 = (text: string, sel: TextSelection) => insertHeader(text, sel, 6);

// ============================================================================
// Special Elements
// ============================================================================

/**
 * Insert a markdown table
 */
export function insertTable(
    text: string, 
    selection: TextSelection,
    columns: number = 2,
    rows: number = 2
): InsertResult {
    const headers = Array(columns).fill('Header').map((h, i) => `${h} ${i + 1}`).join(' | ');
    const separator = Array(columns).fill('---').join(' | ');
    const dataRows = Array(rows).fill(null)
        .map(() => Array(columns).fill('Cell').map((c, i) => `${c} ${i + 1}`).join(' | '))
        .join('\n');
    
    const table = `| ${headers} |\n| ${separator} |\n| ${dataRows.replace(/\n/g, ' |\n| ')} |`;
    
    const newText = text.substring(0, selection.start) + table + text.substring(selection.end);
    
    return {
        text: newText,
        cursorPosition: selection.start + table.length,
    };
}

/**
 * Insert a spoiler block (Hive-specific syntax)
 */
export function insertSpoiler(
    text: string, 
    selection: TextSelection,
    title: string = 'Spoiler'
): InsertResult {
    const selectedText = text.substring(selection.start, selection.end) || 'Hidden content here';
    const spoiler = `>! [${title}] ${selectedText}`;
    
    const newText = text.substring(0, selection.start) + spoiler + text.substring(selection.end);
    
    return {
        text: newText,
        cursorPosition: selection.start + spoiler.length,
    };
}

/**
 * Insert a horizontal rule
 */
export function insertHorizontalRule(text: string, selection: TextSelection): InsertResult {
    const hr = '\n\n---\n\n';
    const newText = text.substring(0, selection.start) + hr + text.substring(selection.end);
    
    return {
        text: newText,
        cursorPosition: selection.start + hr.length,
    };
}

/**
 * Insert an emoji
 */
export function insertEmoji(text: string, selection: TextSelection, emoji: string): InsertResult {
    const newText = text.substring(0, selection.start) + emoji + text.substring(selection.end);
    
    return {
        text: newText,
        cursorPosition: selection.start + emoji.length,
    };
}

/**
 * Insert a Hive user mention
 */
export function insertMention(
    text: string, 
    selection: TextSelection, 
    username: string
): InsertResult {
    const mention = `@${username} `;
    const newText = text.substring(0, selection.start) + mention + text.substring(selection.end);
    
    return {
        text: newText,
        cursorPosition: selection.start + mention.length,
    };
}

/**
 * Insert a GIF from Giphy
 */
export function insertGif(
    text: string, 
    selection: TextSelection, 
    gifUrl: string
): InsertResult {
    // Use the downsized GIF URL directly as an image
    const gifMarkdown = `\n![gif](${gifUrl})\n`;
    const newText = text.substring(0, selection.start) + gifMarkdown + text.substring(selection.end);
    
    return {
        text: newText,
        cursorPosition: selection.start + gifMarkdown.length,
    };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Wrap selected text with prefix and suffix
 */
function wrapSelection(
    text: string, 
    selection: TextSelection, 
    prefix: string, 
    suffix: string
): InsertResult {
    const before = text.substring(0, selection.start);
    const selected = text.substring(selection.start, selection.end);
    const after = text.substring(selection.end);
    
    const newText = before + prefix + selected + suffix + after;
    
    // Position cursor after the wrapped text
    const cursorPos = selection.start + prefix.length + selected.length + suffix.length;
    
    return {
        text: newText,
        cursorPosition: cursorPos,
        selection: {
            start: selection.start + prefix.length,
            end: selection.start + prefix.length + selected.length
        }
    };
}

/**
 * Insert text at the start of the current line
 */
function insertAtLineStart(
    text: string, 
    selection: TextSelection, 
    prefix: string
): InsertResult {
    // Find the start of the current line
    let lineStart = selection.start;
    while (lineStart > 0 && text[lineStart - 1] !== '\n') {
        lineStart--;
    }
    
    // Check if we need a newline before
    const needsNewline = lineStart > 0 && text[lineStart - 1] !== '\n';
    const actualPrefix = needsNewline ? '\n' + prefix : prefix;
    
    const newText = text.substring(0, lineStart) + actualPrefix + text.substring(lineStart);
    
    return {
        text: newText,
        cursorPosition: selection.start + actualPrefix.length,
    };
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get the current selection from a textarea element
 */
export function getSelectionFromTextarea(textarea: HTMLTextAreaElement): TextSelection {
    return {
        start: textarea.selectionStart,
        end: textarea.selectionEnd
    };
}

/**
 * Apply an insert result to a textarea and restore cursor position
 */
export function applyToTextarea(
    textarea: HTMLTextAreaElement,
    result: InsertResult,
    onChange?: (value: string) => void
): void {
    const restoreSelection = () => {
        textarea.focus();
        if (result.selection) {
            textarea.setSelectionRange(result.selection.start, result.selection.end);
        } else {
            textarea.setSelectionRange(result.cursorPosition, result.cursorPosition);
        }
    };

    if (onChange) {
        // Controlled-input case: let the framework own `.value` via its own
        // re-render instead of also writing it here directly. A direct write
        // followed by onChange racy re-render would set `.value` a second
        // time on commit, and the textarea/input `value` IDL setter resets
        // the native cursor to the end whenever it's invoked — some engines
        // skip that reset if the string happens to be unchanged, some don't,
        // so this only surfaced as an intermittent, browser-dependent "cursor
        // jumps to the end" bug. Restoring selection on the next frame runs
        // after that commit has already happened, so it's always the last
        // word regardless of engine-specific same-value optimizations.
        onChange(result.text);
        requestAnimationFrame(restoreSelection);
    } else {
        // Uncontrolled usage — nothing else will write `.value`, so this
        // function owns the DOM directly and can restore selection inline.
        textarea.value = result.text;
        restoreSelection();
    }
}

/**
 * Create a keyboard shortcut handler for common markdown operations
 */
export function createKeyboardHandler(
    getText: () => string,
    getSelection: () => TextSelection,
    applyResult: (result: InsertResult) => void
) {
    return (event: KeyboardEvent) => {
        const isMod = event.metaKey || event.ctrlKey;
        
        if (!isMod) return;
        
        const text = getText();
        const selection = getSelection();
        let result: InsertResult | null = null;
        
        switch (event.key.toLowerCase()) {
            case 'b':
                event.preventDefault();
                result = insertBold(text, selection);
                break;
            case 'i':
                event.preventDefault();
                result = insertItalic(text, selection);
                break;
            case 'u':
                event.preventDefault();
                result = insertUnderline(text, selection);
                break;
            case 'k':
                event.preventDefault();
                result = insertLink(text, selection);
                break;
            case '`':
                event.preventDefault();
                result = insertInlineCode(text, selection);
                break;
        }
        
        if (result) {
            applyResult(result);
        }
    };
}
