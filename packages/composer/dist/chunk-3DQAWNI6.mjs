// src/index.ts
var COMMON_EMOJIS = {
  reactions: ["\u{1F60A}", "\u{1F602}", "\u2764\uFE0F", "\u{1F44D}", "\u{1F44E}", "\u{1F525}", "\u{1F4AF}", "\u{1F389}", "\u{1F60D}", "\u{1F914}"],
  expressions: ["\u{1F622}", "\u{1F60E}", "\u{1F644}", "\u{1F634}", "\u{1F917}", "\u{1F929}", "\u{1F62C}", "\u{1F631}", "\u{1F92F}", "\u{1F607}"],
  symbols: ["\u{1F680}", "\u2B50", "\u{1F4AA}", "\u{1F44F}", "\u{1F64C}", "\u{1F91D}", "\u{1F4B0}", "\u{1F4C8}", "\u{1F4C9}", "\u{1F48E}"]
};
var ALL_COMMON_EMOJIS = [
  ...COMMON_EMOJIS.reactions,
  ...COMMON_EMOJIS.expressions,
  ...COMMON_EMOJIS.symbols
];
function insertBold(text, selection) {
  return wrapSelection(text, selection, "**", "**");
}
function insertItalic(text, selection) {
  return wrapSelection(text, selection, "*", "*");
}
function insertUnderline(text, selection) {
  return wrapSelection(text, selection, "<u>", "</u>");
}
function insertStrikethrough(text, selection) {
  return wrapSelection(text, selection, "~~", "~~");
}
function insertInlineCode(text, selection) {
  return wrapSelection(text, selection, "`", "`");
}
function insertLink(text, selection, url = "url") {
  const selectedText = text.substring(selection.start, selection.end) || "link text";
  const linkMarkdown = `[${selectedText}](${url})`;
  const newText = text.substring(0, selection.start) + linkMarkdown + text.substring(selection.end);
  const urlStart = selection.start + selectedText.length + 3;
  const urlEnd = urlStart + url.length;
  return {
    text: newText,
    cursorPosition: urlEnd + 1,
    // After the closing )
    selection: { start: urlStart, end: urlEnd }
  };
}
function insertImage(text, selection, url, altText = "image") {
  const imageMarkdown = `![${altText}](${url})`;
  const newText = text.substring(0, selection.start) + imageMarkdown + text.substring(selection.end);
  return {
    text: newText,
    cursorPosition: selection.start + imageMarkdown.length
  };
}
function insertCodeBlock(text, selection, language = "") {
  const selectedText = text.substring(selection.start, selection.end) || "code here";
  const codeBlock = `\`\`\`${language}
${selectedText}
\`\`\``;
  const newText = text.substring(0, selection.start) + codeBlock + text.substring(selection.end);
  const codeStart = selection.start + 3 + language.length + 1;
  return {
    text: newText,
    cursorPosition: codeStart + selectedText.length,
    selection: { start: codeStart, end: codeStart + selectedText.length }
  };
}
function insertBlockquote(text, selection) {
  return insertAtLineStart(text, selection, "> ");
}
function insertBulletList(text, selection) {
  return insertAtLineStart(text, selection, "- ");
}
function insertNumberedList(text, selection) {
  return insertAtLineStart(text, selection, "1. ");
}
function insertHeader(text, selection, level) {
  const prefix = "#".repeat(level) + " ";
  return insertAtLineStart(text, selection, prefix);
}
var insertH1 = (text, sel) => insertHeader(text, sel, 1);
var insertH2 = (text, sel) => insertHeader(text, sel, 2);
var insertH3 = (text, sel) => insertHeader(text, sel, 3);
var insertH4 = (text, sel) => insertHeader(text, sel, 4);
var insertH5 = (text, sel) => insertHeader(text, sel, 5);
var insertH6 = (text, sel) => insertHeader(text, sel, 6);
function insertTable(text, selection, columns = 2, rows = 2) {
  const headers = Array(columns).fill("Header").map((h, i) => `${h} ${i + 1}`).join(" | ");
  const separator = Array(columns).fill("---").join(" | ");
  const dataRows = Array(rows).fill(null).map(() => Array(columns).fill("Cell").map((c, i) => `${c} ${i + 1}`).join(" | ")).join("\n");
  const table = `| ${headers} |
| ${separator} |
| ${dataRows.replace(/\n/g, " |\n| ")} |`;
  const newText = text.substring(0, selection.start) + table + text.substring(selection.end);
  return {
    text: newText,
    cursorPosition: selection.start + table.length
  };
}
function insertSpoiler(text, selection, title = "Spoiler") {
  const selectedText = text.substring(selection.start, selection.end) || "Hidden content here";
  const spoiler = `>! [${title}] ${selectedText}`;
  const newText = text.substring(0, selection.start) + spoiler + text.substring(selection.end);
  return {
    text: newText,
    cursorPosition: selection.start + spoiler.length
  };
}
function insertHorizontalRule(text, selection) {
  const hr = "\n\n---\n\n";
  const newText = text.substring(0, selection.start) + hr + text.substring(selection.end);
  return {
    text: newText,
    cursorPosition: selection.start + hr.length
  };
}
function insertEmoji(text, selection, emoji) {
  const newText = text.substring(0, selection.start) + emoji + text.substring(selection.end);
  return {
    text: newText,
    cursorPosition: selection.start + emoji.length
  };
}
function insertMention(text, selection, username) {
  const mention = `@${username} `;
  const newText = text.substring(0, selection.start) + mention + text.substring(selection.end);
  return {
    text: newText,
    cursorPosition: selection.start + mention.length
  };
}
function insertGif(text, selection, gifUrl) {
  const gifMarkdown = `
![gif](${gifUrl})
`;
  const newText = text.substring(0, selection.start) + gifMarkdown + text.substring(selection.end);
  return {
    text: newText,
    cursorPosition: selection.start + gifMarkdown.length
  };
}
function wrapSelection(text, selection, prefix, suffix) {
  const before = text.substring(0, selection.start);
  const selected = text.substring(selection.start, selection.end);
  const after = text.substring(selection.end);
  const newText = before + prefix + selected + suffix + after;
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
function insertAtLineStart(text, selection, prefix) {
  let lineStart = selection.start;
  while (lineStart > 0 && text[lineStart - 1] !== "\n") {
    lineStart--;
  }
  const needsNewline = lineStart > 0 && text[lineStart - 1] !== "\n";
  const actualPrefix = needsNewline ? "\n" + prefix : prefix;
  const newText = text.substring(0, lineStart) + actualPrefix + text.substring(lineStart);
  return {
    text: newText,
    cursorPosition: selection.start + actualPrefix.length
  };
}
function getSelectionFromTextarea(textarea) {
  return {
    start: textarea.selectionStart,
    end: textarea.selectionEnd
  };
}
function applyToTextarea(textarea, result, onChange) {
  const restoreSelection = () => {
    textarea.focus();
    if (result.selection) {
      textarea.setSelectionRange(result.selection.start, result.selection.end);
    } else {
      textarea.setSelectionRange(result.cursorPosition, result.cursorPosition);
    }
  };
  if (onChange) {
    onChange(result.text);
    requestAnimationFrame(restoreSelection);
  } else {
    textarea.value = result.text;
    restoreSelection();
  }
}
function createKeyboardHandler(getText, getSelection, applyResult) {
  return (event) => {
    const isMod = event.metaKey || event.ctrlKey;
    if (!isMod) return;
    const text = getText();
    const selection = getSelection();
    let result = null;
    switch (event.key.toLowerCase()) {
      case "b":
        event.preventDefault();
        result = insertBold(text, selection);
        break;
      case "i":
        event.preventDefault();
        result = insertItalic(text, selection);
        break;
      case "u":
        event.preventDefault();
        result = insertUnderline(text, selection);
        break;
      case "k":
        event.preventDefault();
        result = insertLink(text, selection);
        break;
      case "`":
        event.preventDefault();
        result = insertInlineCode(text, selection);
        break;
    }
    if (result) {
      applyResult(result);
    }
  };
}

export { ALL_COMMON_EMOJIS, COMMON_EMOJIS, applyToTextarea, createKeyboardHandler, getSelectionFromTextarea, insertBlockquote, insertBold, insertBulletList, insertCodeBlock, insertEmoji, insertGif, insertH1, insertH2, insertH3, insertH4, insertH5, insertH6, insertHeader, insertHorizontalRule, insertImage, insertInlineCode, insertItalic, insertLink, insertMention, insertNumberedList, insertSpoiler, insertStrikethrough, insertTable, insertUnderline };
//# sourceMappingURL=chunk-3DQAWNI6.mjs.map
//# sourceMappingURL=chunk-3DQAWNI6.mjs.map