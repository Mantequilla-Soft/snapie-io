import type { FeedbackCategory } from './model';

export const CHAT_SESSION_TOKEN_KEY = 'hive-chat-token';

export function readChatSessionToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const token = window.localStorage.getItem(CHAT_SESSION_TOKEN_KEY);
    if (!token || token.length > 8_000) return null;
    return token;
  } catch {
    return null;
  }
}

export async function submitFeedback(input: {
  title: string;
  body: string;
  category: FeedbackCategory | '';
  pageUrl: string;
  chatToken: string | null;
}): Promise<{ ok: true; url: string | null } | { ok: false; error: string }> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (input.chatToken) headers.Authorization = `Bearer ${input.chatToken}`;

  const payload: Record<string, string> = {
    title: input.title,
    body: input.body,
    pageUrl: input.pageUrl,
  };
  if (input.category) payload.category = input.category;

  try {
    const res = await fetch('/api/feedback', {
      method: 'POST',
      credentials: 'same-origin',
      headers,
      body: JSON.stringify(payload),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: unknown; url?: unknown };
    if (!res.ok) {
      const message = typeof data.error === 'string' && data.error.length > 0 && data.error.length < 240
        ? data.error
        : 'We could not send that. Please try again.';
      return { ok: false, error: message };
    }
    const url = typeof data.url === 'string' && data.url.startsWith('https://github.com/') ? data.url : null;
    return { ok: true, url };
  } catch {
    return { ok: false, error: 'We could not send that. Please try again.' };
  }
}
