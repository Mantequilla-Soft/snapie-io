import React from 'react';
import { TextSelection } from './index.js';
export { ALL_COMMON_EMOJIS, COMMON_EMOJIS, InsertResult, applyToTextarea, createKeyboardHandler, getSelectionFromTextarea, insertBlockquote, insertBold, insertBulletList, insertCodeBlock, insertEmoji, insertGif, insertH1, insertH2, insertH3, insertH4, insertH5, insertH6, insertHeader, insertHorizontalRule, insertImage, insertItalic, insertLink, insertMention, insertNumberedList, insertSpoiler, insertStrikethrough, insertTable, insertUnderline } from './index.js';

/**
 * @snapie/composer/react
 *
 * Pre-built React components for Hive markdown editing.
 * Built with Chakra UI for styling.
 *
 * @example
 * ```tsx
 * import { MarkdownEditor } from '@snapie/composer/react';
 *
 * function MyEditor() {
 *   const [content, setContent] = useState('');
 *
 *   return (
 *     <MarkdownEditor
 *       value={content}
 *       onChange={setContent}
 *       onImageUpload={async (file) => {
 *         // Upload to Hive/IPFS and return URL
 *         return 'https://...';
 *       }}
 *     />
 *   );
 * }
 * ```
 */

interface EditorToolbarProps {
    /** Reference to the textarea element */
    textareaRef: React.RefObject<HTMLTextAreaElement | null>;
    /** Current markdown value */
    value: string;
    /** Callback when value changes */
    onChange: (value: string) => void;
    /** Optional image upload handler */
    onImageUpload?: (file: File) => Promise<string>;
    /** Optional GIF selection handler (e.g., open Giphy modal) */
    onGifClick?: () => void;
    /** Whether the toolbar is disabled */
    disabled?: boolean;
    /** Additional class name */
    className?: string;
}
interface MarkdownEditorProps {
    /** Current markdown value */
    value: string;
    /** Callback when value changes */
    onChange: (value: string) => void;
    /** Placeholder text */
    placeholder?: string;
    /** Optional image upload handler */
    onImageUpload?: (file: File) => Promise<string>;
    /** Optional GIF selection handler */
    onGifClick?: () => void;
    /** Whether the editor is disabled */
    disabled?: boolean;
    /** Minimum height */
    minHeight?: string;
    /** Additional class name */
    className?: string;
    /** Show toolbar */
    showToolbar?: boolean;
    /** Render function for preview (use @snapie/renderer) */
    renderPreview?: (markdown: string) => React.ReactNode;
}
interface UseMarkdownEditorOptions {
    /** Initial value */
    initialValue?: string;
    /** Callback when value changes */
    onChange?: (value: string) => void;
}
/**
 * Hook for managing markdown editor state and operations
 *
 * @example
 * ```tsx
 * const { value, onChange, textareaRef, toolbar } = useMarkdownEditor({
 *   initialValue: '',
 *   onChange: (v) => console.log('Changed:', v)
 * });
 *
 * // Use toolbar.bold(), toolbar.italic(), etc.
 * ```
 */
declare function useMarkdownEditor(options?: UseMarkdownEditorOptions): {
    value: string;
    onChange: (newValue: string) => void;
    textareaRef: React.RefObject<HTMLTextAreaElement | null>;
    toolbar: {
        bold: () => void;
        italic: () => void;
        underline: () => void;
        strikethrough: () => void;
        link: (url?: string) => void;
        image: (url: string, alt?: string) => void;
        codeBlock: (lang?: string) => void;
        blockquote: () => void;
        bulletList: () => void;
        numberedList: () => void;
        header: (level: 1 | 2 | 3 | 4 | 5 | 6) => void;
        table: (cols?: number, rows?: number) => void;
        spoiler: (title?: string) => void;
        emoji: (emoji: string) => void;
        gif: (url: string) => void;
    };
    getSelection: () => TextSelection;
};
/**
 * Headless toolbar hook - returns actions without any UI
 * Use this if you want to build your own toolbar UI
 */
declare function useEditorToolbar(textareaRef: React.RefObject<HTMLTextAreaElement | null>, value: string, onChange: (value: string) => void): {
    bold: () => void;
    italic: () => void;
    underline: () => void;
    strikethrough: () => void;
    link: (url?: string) => void;
    image: (url: string, alt?: string) => void;
    codeBlock: (lang?: string) => void;
    blockquote: () => void;
    bulletList: () => void;
    numberedList: () => void;
    header: (level: 1 | 2 | 3 | 4 | 5 | 6) => void;
    table: (cols?: number, rows?: number) => void;
    spoiler: (title?: string) => void;
    emoji: (emoji: string) => void;
    gif: (url: string) => void;
};

export { type EditorToolbarProps, type MarkdownEditorProps, TextSelection, type UseMarkdownEditorOptions, useEditorToolbar, useMarkdownEditor };
