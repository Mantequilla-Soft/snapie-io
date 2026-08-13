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

'use client';

import React, { useRef, useCallback, useEffect } from 'react';
import { flushSync } from 'react-dom';
import {
    insertBold,
    insertItalic,
    insertUnderline,
    insertStrikethrough,
    insertLink,
    insertImage,
    insertCodeBlock,
    insertBlockquote,
    insertBulletList,
    insertNumberedList,
    insertHeader,
    insertTable,
    insertSpoiler,
    insertEmoji,
    insertGif,
    getSelectionFromTextarea,
    createKeyboardHandler,
    type TextSelection,
    type InsertResult,
} from '../index';

// ============================================================================
// Types
// ============================================================================

export interface EditorToolbarProps {
    /** Reference to the textarea element */
    textareaRef: React.RefObject<HTMLTextAreaElement>;
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

export interface MarkdownEditorProps {
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

export interface UseMarkdownEditorOptions {
    /** Initial value */
    initialValue?: string;
    /** Callback when value changes */
    onChange?: (value: string) => void;
}

// ============================================================================
// Internal: commit a toolbar edit and restore the caret without racing React
// ============================================================================

/**
 * `applyToTextarea`'s controlled-input branch (in the framework-agnostic
 * core) calls `onChange` then restores the selection on the next animation
 * frame, because the DOM `value` only catches up once React re-renders. That
 * frame-long gap is a real race: if the user keeps typing before it fires —
 * or the frame is merely late, e.g. a busy tab — the render that lands
 * during the gap overwrites the textarea's DOM value with `result.text`
 * wholesale, silently eating whatever was just typed, and then the deferred
 * `setSelectionRange` plants the caret at the toolbar action's position
 * instead of where the user actually is. `flushSync` forces that render to
 * happen synchronously so the selection restore below always runs after the
 * real value is already committed to the DOM — no gap for a keystroke to
 * land in.
 */
function commitToTextarea(
    textarea: HTMLTextAreaElement,
    result: InsertResult,
    onChange: (value: string) => void
): void {
    flushSync(() => onChange(result.text));
    textarea.focus();
    if (result.selection) {
        textarea.setSelectionRange(result.selection.start, result.selection.end);
    } else {
        textarea.setSelectionRange(result.cursorPosition, result.cursorPosition);
    }
}

// ============================================================================
// Hook: useMarkdownEditor
// ============================================================================

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
export function useMarkdownEditor(options: UseMarkdownEditorOptions = {}) {
    const [value, setValue] = React.useState(options.initialValue ?? '');
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    
    const handleChange = useCallback((newValue: string) => {
        setValue(newValue);
        options.onChange?.(newValue);
    }, [options.onChange]);
    
    const getSelection = useCallback((): TextSelection => {
        if (!textareaRef.current) return { start: 0, end: 0 };
        return getSelectionFromTextarea(textareaRef.current);
    }, []);
    
    const apply = useCallback((result: InsertResult) => {
        if (!textareaRef.current) return;
        commitToTextarea(textareaRef.current, result, handleChange);
    }, [handleChange]);
    
    // Create toolbar action functions
    const toolbar = React.useMemo(() => ({
        bold: () => apply(insertBold(value, getSelection())),
        italic: () => apply(insertItalic(value, getSelection())),
        underline: () => apply(insertUnderline(value, getSelection())),
        strikethrough: () => apply(insertStrikethrough(value, getSelection())),
        link: (url?: string) => apply(insertLink(value, getSelection(), url)),
        image: (url: string, alt?: string) => apply(insertImage(value, getSelection(), url, alt)),
        codeBlock: (lang?: string) => apply(insertCodeBlock(value, getSelection(), lang)),
        blockquote: () => apply(insertBlockquote(value, getSelection())),
        bulletList: () => apply(insertBulletList(value, getSelection())),
        numberedList: () => apply(insertNumberedList(value, getSelection())),
        header: (level: 1 | 2 | 3 | 4 | 5 | 6) => apply(insertHeader(value, getSelection(), level)),
        table: (cols?: number, rows?: number) => apply(insertTable(value, getSelection(), cols, rows)),
        spoiler: (title?: string) => apply(insertSpoiler(value, getSelection(), title)),
        emoji: (emoji: string) => apply(insertEmoji(value, getSelection(), emoji)),
        gif: (url: string) => apply(insertGif(value, getSelection(), url)),
    }), [value, getSelection, apply]);
    
    // Keyboard shortcuts
    useEffect(() => {
        const handler = createKeyboardHandler(
            () => value,
            getSelection,
            apply
        );
        
        const textarea = textareaRef.current;
        if (textarea) {
            textarea.addEventListener('keydown', handler as EventListener);
            return () => textarea.removeEventListener('keydown', handler as EventListener);
        }
    }, [value, getSelection, apply]);
    
    return {
        value,
        onChange: handleChange,
        textareaRef,
        toolbar,
        getSelection,
    };
}

// ============================================================================
// Component: EditorToolbar (Headless - bring your own UI)
// ============================================================================

/**
 * Headless toolbar hook - returns actions without any UI
 * Use this if you want to build your own toolbar UI
 */
export function useEditorToolbar(
    textareaRef: React.RefObject<HTMLTextAreaElement>,
    value: string,
    onChange: (value: string) => void
) {
    const getSelection = useCallback((): TextSelection => {
        if (!textareaRef.current) return { start: 0, end: 0 };
        return getSelectionFromTextarea(textareaRef.current);
    }, [textareaRef]);
    
    const apply = useCallback((result: InsertResult) => {
        if (!textareaRef.current) return;
        commitToTextarea(textareaRef.current, result, onChange);
    }, [textareaRef, onChange]);
    
    return React.useMemo(() => ({
        bold: () => apply(insertBold(value, getSelection())),
        italic: () => apply(insertItalic(value, getSelection())),
        underline: () => apply(insertUnderline(value, getSelection())),
        strikethrough: () => apply(insertStrikethrough(value, getSelection())),
        link: (url?: string) => apply(insertLink(value, getSelection(), url)),
        image: (url: string, alt?: string) => apply(insertImage(value, getSelection(), url, alt)),
        codeBlock: (lang?: string) => apply(insertCodeBlock(value, getSelection(), lang)),
        blockquote: () => apply(insertBlockquote(value, getSelection())),
        bulletList: () => apply(insertBulletList(value, getSelection())),
        numberedList: () => apply(insertNumberedList(value, getSelection())),
        header: (level: 1 | 2 | 3 | 4 | 5 | 6) => apply(insertHeader(value, getSelection(), level)),
        table: (cols?: number, rows?: number) => apply(insertTable(value, getSelection(), cols, rows)),
        spoiler: (title?: string) => apply(insertSpoiler(value, getSelection(), title)),
        emoji: (emoji: string) => apply(insertEmoji(value, getSelection(), emoji)),
        gif: (url: string) => apply(insertGif(value, getSelection(), url)),
    }), [value, getSelection, apply]);
}

// ============================================================================
// Re-export core utilities
// ============================================================================

export {
    // Core functions
    insertBold,
    insertItalic,
    insertUnderline,
    insertStrikethrough,
    insertLink,
    insertImage,
    insertCodeBlock,
    insertBlockquote,
    insertBulletList,
    insertNumberedList,
    insertHeader,
    insertH1,
    insertH2,
    insertH3,
    insertH4,
    insertH5,
    insertH6,
    insertTable,
    insertSpoiler,
    insertHorizontalRule,
    insertEmoji,
    insertMention,
    insertGif,
    // Utilities
    getSelectionFromTextarea,
    applyToTextarea,
    createKeyboardHandler,
    // Constants
    COMMON_EMOJIS,
    ALL_COMMON_EMOJIS,
} from '../index';

export type { TextSelection, InsertResult } from '../index';
