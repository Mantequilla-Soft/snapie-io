import { getSelectionFromTextarea, applyToTextarea, insertGif, insertEmoji, insertSpoiler, insertTable, insertHeader, insertNumberedList, insertBulletList, insertBlockquote, insertCodeBlock, insertImage, insertLink, insertStrikethrough, insertUnderline, insertItalic, insertBold, createKeyboardHandler } from './chunk-3DQAWNI6.mjs';
export { ALL_COMMON_EMOJIS, COMMON_EMOJIS, applyToTextarea, createKeyboardHandler, getSelectionFromTextarea, insertBlockquote, insertBold, insertBulletList, insertCodeBlock, insertEmoji, insertGif, insertH1, insertH2, insertH3, insertH4, insertH5, insertH6, insertHeader, insertHorizontalRule, insertImage, insertItalic, insertLink, insertMention, insertNumberedList, insertSpoiler, insertStrikethrough, insertTable, insertUnderline } from './chunk-3DQAWNI6.mjs';
import React, { useRef, useCallback, useEffect } from 'react';

function useMarkdownEditor(options = {}) {
  const [value, setValue] = React.useState(options.initialValue ?? "");
  const textareaRef = useRef(null);
  const handleChange = useCallback((newValue) => {
    setValue(newValue);
    options.onChange?.(newValue);
  }, [options.onChange]);
  const getSelection = useCallback(() => {
    if (!textareaRef.current) return { start: 0, end: 0 };
    return getSelectionFromTextarea(textareaRef.current);
  }, []);
  const apply = useCallback((result) => {
    if (!textareaRef.current) return;
    applyToTextarea(textareaRef.current, result, handleChange);
  }, [handleChange]);
  const toolbar = React.useMemo(() => ({
    bold: () => apply(insertBold(value, getSelection())),
    italic: () => apply(insertItalic(value, getSelection())),
    underline: () => apply(insertUnderline(value, getSelection())),
    strikethrough: () => apply(insertStrikethrough(value, getSelection())),
    link: (url) => apply(insertLink(value, getSelection(), url)),
    image: (url, alt) => apply(insertImage(value, getSelection(), url, alt)),
    codeBlock: (lang) => apply(insertCodeBlock(value, getSelection(), lang)),
    blockquote: () => apply(insertBlockquote(value, getSelection())),
    bulletList: () => apply(insertBulletList(value, getSelection())),
    numberedList: () => apply(insertNumberedList(value, getSelection())),
    header: (level) => apply(insertHeader(value, getSelection(), level)),
    table: (cols, rows) => apply(insertTable(value, getSelection(), cols, rows)),
    spoiler: (title) => apply(insertSpoiler(value, getSelection(), title)),
    emoji: (emoji) => apply(insertEmoji(value, getSelection(), emoji)),
    gif: (url) => apply(insertGif(value, getSelection(), url))
  }), [value, getSelection, apply]);
  useEffect(() => {
    const handler = createKeyboardHandler(
      () => value,
      getSelection,
      apply
    );
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.addEventListener("keydown", handler);
      return () => textarea.removeEventListener("keydown", handler);
    }
  }, [value, getSelection, apply]);
  return {
    value,
    onChange: handleChange,
    textareaRef,
    toolbar,
    getSelection
  };
}
function useEditorToolbar(textareaRef, value, onChange) {
  const getSelection = useCallback(() => {
    if (!textareaRef.current) return { start: 0, end: 0 };
    return getSelectionFromTextarea(textareaRef.current);
  }, [textareaRef]);
  const apply = useCallback((result) => {
    if (!textareaRef.current) return;
    applyToTextarea(textareaRef.current, result, onChange);
  }, [textareaRef, onChange]);
  return React.useMemo(() => ({
    bold: () => apply(insertBold(value, getSelection())),
    italic: () => apply(insertItalic(value, getSelection())),
    underline: () => apply(insertUnderline(value, getSelection())),
    strikethrough: () => apply(insertStrikethrough(value, getSelection())),
    link: (url) => apply(insertLink(value, getSelection(), url)),
    image: (url, alt) => apply(insertImage(value, getSelection(), url, alt)),
    codeBlock: (lang) => apply(insertCodeBlock(value, getSelection(), lang)),
    blockquote: () => apply(insertBlockquote(value, getSelection())),
    bulletList: () => apply(insertBulletList(value, getSelection())),
    numberedList: () => apply(insertNumberedList(value, getSelection())),
    header: (level) => apply(insertHeader(value, getSelection(), level)),
    table: (cols, rows) => apply(insertTable(value, getSelection(), cols, rows)),
    spoiler: (title) => apply(insertSpoiler(value, getSelection(), title)),
    emoji: (emoji) => apply(insertEmoji(value, getSelection(), emoji)),
    gif: (url) => apply(insertGif(value, getSelection(), url))
  }), [value, getSelection, apply]);
}

export { useEditorToolbar, useMarkdownEditor };
//# sourceMappingURL=react.mjs.map
//# sourceMappingURL=react.mjs.map