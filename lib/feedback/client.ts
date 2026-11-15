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

/**
 * The chat JWT, but only while it is still usable: three parts and an `exp`
 * more than a minute in the future. `/api/feedback` only trusts a verified
 * chat JWT or a Snapie Auth cookie, so an expired token must not unlock the
 * screenshot picker.
 */
export function readUsableChatSessionToken(nowMs: number = Date.now()): string | null {
  const token = readChatSessionToken();
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3 || !parts[1]) return null;
  try {
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64.padEnd(Math.ceil(b64.length / 4) * 4, '=');
    const payload = JSON.parse(atob(padded)) as { exp?: unknown };
    if (typeof payload.exp !== 'number' || payload.exp * 1000 <= nowMs + 60_000) return null;
    return token;
  } catch {
    return null;
  }
}

/**
 * Ask the server which Hive account it would attach this feedback to, using
 * the same check `/api/feedback` applies on submit (chat JWT or Snapie Auth
 * cookie). Returns null when the server would treat the sender as a guest.
 */
export async function fetchFeedbackIdentity(chatToken: string | null): Promise<string | null> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (chatToken) headers.Authorization = `Bearer ${chatToken}`;
  try {
    const res = await fetch('/api/feedback', { method: 'GET', credentials: 'same-origin', headers, cache: 'no-store' });
    if (!res.ok) return null;
    const data = (await res.json().catch(() => ({}))) as { hiveUsername?: unknown };
    return typeof data.hiveUsername === 'string' && data.hiveUsername ? data.hiveUsername : null;
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
  screenshotUrl?: string | null;
}): Promise<{ ok: true; url: string | null } | { ok: false; error: string }> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (input.chatToken) headers.Authorization = `Bearer ${input.chatToken}`;

  const payload: Record<string, string> = {
    title: input.title,
    body: input.body,
    pageUrl: input.pageUrl,
  };
  if (input.category) payload.category = input.category;
  if (input.screenshotUrl) payload.screenshotUrl = input.screenshotUrl;

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
