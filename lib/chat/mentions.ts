/**
 *  Mention parsing, shared by the server (which persists the extracted list on
 *  every Message so unread can be computed with an indexed query instead of a
 *  regex scan) and by the client (highlighting, the mention autocomplete, the
 *  chime). Both sides must agree on what counts as a mention, so neither gets
 *  its own copy of the regex.
 *
 *  Deliberately dependency-free — it is imported from a route handler and from
 *  a 'use client' component.
 */

/** Hive usernames are lowercase and may contain dots and dashes. */
export const MENTION_REGEX = /@[a-z0-9.-]+/gi;

/** Matches a mention still being typed, for the composer's autocomplete. */
export const MENTION_INPUT_REGEX = /(?:^|\s)@([a-z0-9.-]{0,32})$/i;

/** '@Alice.' -> 'alice'. Trailing dots/dashes are sentence punctuation, never
 *  part of a Hive username, so they are stripped — without this, "hey @alice."
 *  parsed to 'alice.' and silently failed to notify anyone. */
export function normalizeMentionToken(value: string): string {
  return value
    .replace(/^@/, '')
    .trim()
    .toLowerCase()
    .replace(/[.-]+$/, '');
}

/** Every distinct username mentioned in a message body. */
export function extractMentions(content: string): string[] {
  if (!content) return [];
  const matches = content.match(MENTION_REGEX) || [];
  const out = new Set<string>();
  for (const token of matches) {
    const name = normalizeMentionToken(token);
    if (name) out.add(name);
  }
  return Array.from(out);
}

export function messageMentionsUser(content: string, username?: string | null): boolean {
  if (!content || !username) return false;
  const target = normalizeMentionToken(username);
  if (!target) return false;
  return extractMentions(content).includes(target);
}

export interface ActiveMentionDraft {
  /** Index of the `@` that starts this draft. */
  start: number;
  /** Cursor position — where the replacement text ends. */
  end: number;
  /** Text typed so far after the `@`, lowercased. */
  query: string;
}

/** The `@partial` a caret is currently sitting inside of, if any — for driving
 *  a live suggestion dropdown. Anchored to content *before* the cursor only,
 *  so a mention elsewhere in the text (before or after) is never mistaken for
 *  the one being actively typed. */
export function getActiveMentionDraft(content: string, cursorPos: number): ActiveMentionDraft | null {
  if (!content || cursorPos < 0 || cursorPos > content.length) return null;
  const beforeCursor = content.slice(0, cursorPos);
  const match = beforeCursor.match(MENTION_INPUT_REGEX);
  if (!match) return null;
  const atIdx = beforeCursor.lastIndexOf('@');
  if (atIdx < 0) return null;
  return {
    start: atIdx,
    end: cursorPos,
    query: (match[1] || '').toLowerCase(),
  };
}
