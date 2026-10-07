export const FEEDBACK_TITLE_MAX = 120;
export const FEEDBACK_BODY_MAX = 4_000;
export const FEEDBACK_RAW_MAX = 16_000;
export const USER_AGENT_MAX = 180;
export const PAGE_URL_MAX = 500;

export type FeedbackCategory = 'bug' | 'idea' | 'other';

export interface ParsedFeedback {
  title: string;
  body: string;
  category: FeedbackCategory | null;
  pageUrl: string | null;
}

const CATEGORIES = new Set<FeedbackCategory>(['bug', 'idea', 'other']);

const SENSITIVE_QUERY = new Set([
  'email',
  'e-mail',
  'token',
  'access_token',
  'id_token',
  'code',
  'session',
  'cookie',
  'password',
  'secret',
]);

function oneLine(value: string): string {
  return value.replace(/[\r\n\t\0]+/g, ' ').replace(/ {2,}/g, ' ').trim();
}

export function sanitizePageUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || /[\r\n\0]/.test(trimmed)) return null;

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;

  url.username = '';
  url.password = '';
  url.hash = '';
  for (const key of [...url.searchParams.keys()]) {
    if (SENSITIVE_QUERY.has(key.toLowerCase())) url.searchParams.delete(key);
  }

  const out = url.toString();
  return out.length <= PAGE_URL_MAX ? out : out.slice(0, PAGE_URL_MAX);
}

export function truncateUserAgent(value: string | null | undefined): string {
  if (!value) return 'unknown';
  const clean = value.replace(/[\r\n\0]/g, ' ').replace(/ {2,}/g, ' ').trim();
  if (!clean) return 'unknown';
  if (clean.length <= USER_AGENT_MAX) return clean;
  return `${clean.slice(0, USER_AGENT_MAX - 1)}…`;
}

export function parseFeedbackSubmission(
  payload: unknown,
): { ok: true; value: ParsedFeedback } | { ok: false; error: string } {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { ok: false, error: 'Add a short title and a message.' };
  }

  const raw = payload as Record<string, unknown>;
  const title = typeof raw.title === 'string' ? oneLine(raw.title) : '';
  const body = typeof raw.body === 'string' ? raw.body.replace(/\0/g, '').trim() : '';

  if (!title || !body) {
    return { ok: false, error: 'Add a short title and a message.' };
  }
  if (title.length > FEEDBACK_TITLE_MAX) {
    return { ok: false, error: 'That title is too long.' };
  }
  if (body.length > FEEDBACK_BODY_MAX) {
    return { ok: false, error: 'That message is too long.' };
  }

  let category: FeedbackCategory | null = null;
  if (raw.category != null && raw.category !== '') {
    if (typeof raw.category !== 'string' || !CATEGORIES.has(raw.category as FeedbackCategory)) {
      return { ok: false, error: 'Pick bug, idea, or other.' };
    }
    category = raw.category as FeedbackCategory;
  }

  return {
    ok: true,
    value: {
      title,
      body,
      category,
      pageUrl: sanitizePageUrl(raw.pageUrl),
    },
  };
}

export function feedbackLabels(category: FeedbackCategory | null): string[] {
  const labels = ['feedback'];
  if (category === 'bug') labels.push('bug');
  if (category === 'idea') labels.push('idea');
  return labels;
}

export function buildFeedbackIssue(input: {
  title: string;
  body: string;
  category: FeedbackCategory | null;
  pageUrl: string | null;
  hiveUsername: string | null;
  userAgent: string;
}): { title: string; body: string; labels: string[] } {
  const prefix = input.category === 'bug' ? '[Bug]' : input.category === 'idea' ? '[Idea]' : '[Feedback]';
  const category = input.category ?? 'unspecified';
  const who = input.hiveUsername ?? 'guest';
  const page = input.pageUrl ?? 'unknown';
  const body = [
    `**Category:** ${category}`,
    `**Page:** ${page}`,
    `**Hive user:** ${who}`,
    '',
    input.body,
    '',
    `**User agent:** ${input.userAgent}`,
  ].join('\n');

  return {
    title: `${prefix} ${input.title}`,
    body,
    labels: feedbackLabels(input.category),
  };
}
