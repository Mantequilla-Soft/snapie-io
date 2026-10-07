import markdownRenderer from "@/lib/utils/MarkdownRenderer";
import { snapTextForMarkdown } from "@/lib/utils/snapUtils";

/** Markdown HTML for a snap's text. Server-only: the client bundle must not
 *  import this module, or the renderer ships in the home document. */
export function renderSnapBodyHtml(body: string, author: string): string {
  const text = snapTextForMarkdown(body);
  if (!text) return "";
  return markdownRenderer(text, { defaultEmojiOwner: author });
}
