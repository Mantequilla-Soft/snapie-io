export const FEEDBACK_TITLE_MAX = 120;
export const FEEDBACK_BODY_MAX = 4_000;
export const FEEDBACK_RAW_MAX = 16_000;
export const USER_AGENT_MAX = 180;
export const PAGE_URL_MAX = 500;
export const FEEDBACK_SCREENSHOT_MAX_BYTES = 5 * 1024 * 1024;
export const FEEDBACK_SCREENSHOT_URL_MAX = 500;
export const FEEDBACK_SCREENSHOT_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
export const FEEDBACK_SCREENSHOT_HOSTS = new Set(['images.hive.blog', 'images.3speak.tv']);
export const APP_VERSION_MAX = 40;

export type FeedbackCategory = 'bug' | 'idea' | 'other';

/**
 * Clients other than the Snapie web app that may submit feedback. The source
 * only picks a target from the server's own allow-list (see github.ts); the
 * request never names a repo.
 */
export type FeedbackSource = 'hivesnaps';

export const FEEDBACK_SOURCE_NAMES: Record<FeedbackSource, string> = {
  hivesnaps: 'HiveSnaps app',
};

export interface ParsedFeedback {
  title: string;
  body: string;
  category: FeedbackCategory | null;
  pageUrl: string | null;
  screenshotUrl: string | null;
  /** null means the Snapie web app, including any unknown source value. */
  source: FeedbackSource | null;
  appVersion: string | null;
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

/** An unknown or malformed source is treated as absent, never as an error. */
export function parseFeedbackSource(value: unknown): FeedbackSource | null {
  if (typeof value !== 'string') return null;
  const key = value.trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(FEEDBACK_SOURCE_NAMES, key) ? (key as FeedbackSource) : null;
}

/** One short line, e.g. "1.4.0 (ios)". Anything unusable becomes null. */
export function sanitizeAppVersion(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const clean = oneLine(value.replace(/[\u0000-\u001f\u007f`<>]/g, ' '));
  if (!clean) return null;
  return clean.length <= APP_VERSION_MAX ? clean : clean.slice(0, APP_VERSION_MAX).trim();
}

export function validateFeedbackScreenshotFile(file: { type: string; size: number }): string | null {
  if (!FEEDBACK_SCREENSHOT_TYPES.has(file.type)) {
    return 'Screenshots must be a PNG, JPEG, or WebP image.';
  }
  if (file.size <= 0 || file.size > FEEDBACK_SCREENSHOT_MAX_BYTES) {
    return 'Screenshots must be 5 MB or smaller.';
  }
  return null;
}

/**
 * `URL.toString()` leaves `(` and `)` alone, and an unbalanced `)` would end
 * a Markdown `![…](…)` link early. Percent-encode them so the URL always
 * stays inside the link (images.hive.blog and images.3speak.tv decode them).
 */
export function markdownSafeUrl(url: string): string {
  return url.replace(/\(/g, '%28').replace(/\)/g, '%29');
}

/**
 * Only HTTPS URLs on the hosts this app already uploads images to.
 * Guests cannot attach a screenshot; the route enforces a signed-in session.
 */
export function sanitizeScreenshotUrl(value: unknown): { ok: true; url: string | null } | { ok: false; error: string } {
  const error = 'That screenshot could not be attached.';
  if (value == null || value === '') return { ok: true, url: null };
  if (typeof value !== 'string') return { ok: false, error };
  const trimmed = value.trim();
  if (!trimmed) return { ok: true, url: null };
  if (/[\r\n\0]/.test(trimmed) || trimmed.length > FEEDBACK_SCREENSHOT_URL_MAX) {
    return { ok: false, error };
  }
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return { ok: false, error };
  }
  if (url.protocol !== 'https:') return { ok: false, error };
  if (url.username || url.password) return { ok: false, error };
  const host = url.hostname.replace(/\.$/, '').toLowerCase();
  if (!FEEDBACK_SCREENSHOT_HOSTS.has(host)) return { ok: false, error };
  url.hash = '';
  return { ok: true, url: markdownSafeUrl(url.toString()) };
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

  const screenshot = sanitizeScreenshotUrl(raw.screenshotUrl);
  if (!screenshot.ok) return screenshot;

  const source = parseFeedbackSource(raw.source);

  return {
    ok: true,
    value: {
      title,
      body,
      category,
      pageUrl: sanitizePageUrl(raw.pageUrl),
      screenshotUrl: screenshot.url,
      source,
      appVersion: source ? sanitizeAppVersion(raw.appVersion) : null,
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
  screenshotUrl?: string | null;
  source?: FeedbackSource | null;
  appVersion?: string | null;
}): { title: string; body: string; labels: string[] } {
  const prefix = input.category === 'bug' ? '[Bug]' : input.category === 'idea' ? '[Idea]' : '[Feedback]';
  const category = input.category ?? 'unspecified';
  const who = input.hiveUsername ?? 'guest';
  const page = input.pageUrl ?? 'unknown';
  const lines: string[] = [];
  if (input.source) {
    const from = [FEEDBACK_SOURCE_NAMES[input.source], input.appVersion].filter(Boolean).join(' ');
    lines.push(`**From:** ${from}`);
  }
  lines.push(
    `**Category:** ${category}`,
    `**Page:** ${page}`,
    `**Hive user:** ${who}`,
    '',
    input.body,
  );
  if (input.screenshotUrl) {
    lines.push('', '**Screenshot:**', '', `![Screenshot](${markdownSafeUrl(input.screenshotUrl)})`);
  }
  lines.push('', `**User agent:** ${input.userAgent}`);

  return {
    title: `${prefix} ${input.title}`,
    body: lines.join('\n'),
    labels: feedbackLabels(input.category),
  };
}
