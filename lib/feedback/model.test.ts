import { describe, expect, it } from 'vitest';
import {
  APP_VERSION_MAX,
  FEEDBACK_BODY_MAX,
  FEEDBACK_TITLE_MAX,
  USER_AGENT_MAX,
  buildFeedbackIssue,
  parseFeedbackSubmission,
  sanitizePageUrl,
  sanitizeScreenshotUrl,
  truncateUserAgent,
  validateFeedbackScreenshotFile,
} from './model';

describe('parseFeedbackSubmission', () => {
  it('requires a title and a message', () => {
    expect(parseFeedbackSubmission({ title: '   ', body: 'hello' }).ok).toBe(false);
    expect(parseFeedbackSubmission({ title: 'Hello', body: '  ' }).ok).toBe(false);
    expect(parseFeedbackSubmission(null).ok).toBe(false);
    expect(parseFeedbackSubmission([]).ok).toBe(false);
  });

  it('rejects oversized title and body', () => {
    const title = parseFeedbackSubmission({ title: 'a'.repeat(FEEDBACK_TITLE_MAX + 1), body: 'hello' });
    expect(title).toEqual({ ok: false, error: 'That title is too long.' });
    const body = parseFeedbackSubmission({ title: 'Hello', body: 'a'.repeat(FEEDBACK_BODY_MAX + 1) });
    expect(body).toEqual({ ok: false, error: 'That message is too long.' });
  });

  it('rejects an unknown category and ignores identity fields', () => {
    expect(parseFeedbackSubmission({ title: 'Hello', body: 'there', category: 'spam' })).toEqual({
      ok: false,
      error: 'Pick bug, idea, or other.',
    });

    const parsed = parseFeedbackSubmission({
      title: 'Hello',
      body: 'there',
      category: 'bug',
      hiveUsername: 'mallory',
      email: 'hidden@example.com',
      ip: '203.0.113.8',
    });
    expect(parsed).toEqual({
      ok: true,
      value: {
        title: 'Hello',
        body: 'there',
        category: 'bug',
        pageUrl: null,
        screenshotUrl: null,
        source: null,
        appVersion: null,
      },
    });
  });

  it('collapses a title onto one line', () => {
    const parsed = parseFeedbackSubmission({ title: 'Hello\nthere', body: 'message' });
    expect(parsed.ok && parsed.value.title).toBe('Hello there');
  });
});

describe('sanitizePageUrl', () => {
  it('keeps the page and drops email and token query params', () => {
    expect(sanitizePageUrl('https://snapie.io/settings?tab=theme&email=hidden@example.com&token=abc')).toBe(
      'https://snapie.io/settings?tab=theme',
    );
  });

  it('rejects non-http urls', () => {
    expect(sanitizePageUrl('javascript:alert(1)')).toBeNull();
    expect(sanitizePageUrl('/settings')).toBeNull();
  });
});

describe('truncateUserAgent', () => {
  it('caps length and strips newlines', () => {
    expect(truncateUserAgent('Mozilla/5.0\r\nX')).toBe('Mozilla/5.0 X');
    const long = `${'a'.repeat(USER_AGENT_MAX)}TAIL`;
    const truncated = truncateUserAgent(long);
    expect(truncated.length).toBe(USER_AGENT_MAX);
    expect(truncated.endsWith('…')).toBe(true);
    expect(truncated.includes('TAIL')).toBe(false);
  });
});

describe('buildFeedbackIssue', () => {
  it('prefixes a bug and names the hive user', () => {
    const issue = buildFeedbackIssue({
      title: 'Composer drops a character',
      body: 'The first letter vanishes.',
      category: 'bug',
      pageUrl: 'https://snapie.io/compose',
      hiveUsername: 'alice',
      userAgent: 'TestAgent/1.0',
    });
    expect(issue.title).toBe('[Bug] Composer drops a character');
    expect(issue.labels).toEqual(['feedback', 'bug']);
    expect(issue.body).toContain('**Category:** bug');
    expect(issue.body).toContain('**Page:** https://snapie.io/compose');
    expect(issue.body).toContain('**Hive user:** alice');
    expect(issue.body).toContain('The first letter vanishes.');
    expect(issue.body).toContain('**User agent:** TestAgent/1.0');
    expect(issue.body).not.toContain('![Screenshot]');
  });

  it('embeds an allowlisted screenshot in the issue body', () => {
    const issue = buildFeedbackIssue({
      title: 'Broken layout',
      body: 'See the shot.',
      category: 'bug',
      pageUrl: 'https://snapie.io/',
      hiveUsername: 'alice',
      userAgent: 'ua',
      screenshotUrl: 'https://images.hive.blog/DQmabc/shot.png',
    });
    expect(issue.body).toContain('**Screenshot:**');
    expect(issue.body).toContain('![Screenshot](https://images.hive.blog/DQmabc/shot.png)');
  });

  it('files a guest as guest with a feedback title', () => {
    const issue = buildFeedbackIssue({
      title: 'Nice app',
      body: 'More contrast please.',
      category: null,
      pageUrl: null,
      hiveUsername: null,
      userAgent: 'unknown',
    });
    expect(issue.title).toBe('[Feedback] Nice app');
    expect(issue.labels).toEqual(['feedback']);
    expect(issue.body).toContain('**Hive user:** guest');
    expect(issue.body).toContain('**Page:** unknown');
    expect(issue.body).not.toMatch(/email|cookie|203\.0\.113/i);
  });

  it('prefixes an idea', () => {
    const issue = buildFeedbackIssue({
      title: 'Darker cards',
      body: 'The glass is bright.',
      category: 'idea',
      pageUrl: 'https://snapie.io/',
      hiveUsername: null,
      userAgent: 'ua',
    });
    expect(issue.title).toBe('[Idea] Darker cards');
    expect(issue.labels).toEqual(['feedback', 'idea']);
  });
});

describe('screenshot helpers', () => {
  it('accepts png/jpeg/webp up to 5 MB and rejects other types or sizes', () => {
    expect(validateFeedbackScreenshotFile({ type: 'image/png', size: 12 })).toBeNull();
    expect(validateFeedbackScreenshotFile({ type: 'image/jpeg', size: 5 * 1024 * 1024 })).toBeNull();
    expect(validateFeedbackScreenshotFile({ type: 'image/gif', size: 12 })).toMatch(/PNG, JPEG, or WebP/);
    expect(validateFeedbackScreenshotFile({ type: 'image/png', size: 5 * 1024 * 1024 + 1 })).toMatch(/5 MB/);
  });

  it('only keeps https URLs on the app image hosts', () => {
    expect(sanitizeScreenshotUrl('https://images.hive.blog/DQmabc/shot.png')).toEqual({
      ok: true,
      url: 'https://images.hive.blog/DQmabc/shot.png',
    });
    expect(sanitizeScreenshotUrl('https://images.3speak.tv/u/alice/a.webp')).toEqual({
      ok: true,
      url: 'https://images.3speak.tv/u/alice/a.webp',
    });
    expect(sanitizeScreenshotUrl('')).toEqual({ ok: true, url: null });
    expect(sanitizeScreenshotUrl('https://evil.example/a.png').ok).toBe(false);
    expect(sanitizeScreenshotUrl('http://images.hive.blog/a.png').ok).toBe(false);
    expect(sanitizeScreenshotUrl('https://user:pass@images.hive.blog/a.png').ok).toBe(false);
  });

  it('percent-encodes parentheses so a crafted path cannot break out of the Markdown image', () => {
    const crafted = 'https://images.hive.blog/DQmabc/a.png)[click](https://evil.example/(x)';
    const sanitized = sanitizeScreenshotUrl(crafted);
    expect(sanitized.ok).toBe(true);
    const url = sanitized.ok ? sanitized.url : null;
    expect(url).not.toMatch(/[()]/);
    expect(url?.startsWith('https://images.hive.blog/DQmabc/a.png%29')).toBe(true);

    const issue = buildFeedbackIssue({
      title: 'Shot',
      body: 'Body',
      category: null,
      pageUrl: 'https://snapie.io/',
      hiveUsername: 'alice',
      userAgent: 'ua',
      screenshotUrl: 'https://images.hive.blog/a(b).png',
    });
    expect(issue.body).toContain('![Screenshot](https://images.hive.blog/a%28b%29.png)');
    const line = issue.body.split('\n').find((l) => l.startsWith('![Screenshot]('));
    expect(line?.endsWith(')')).toBe(true);
    expect(line?.slice('![Screenshot]('.length, -1)).not.toMatch(/[()]/);
  });
});

describe('feedback source', () => {
  const base = { title: 'Crash', body: 'It closes.' };

  it('accepts hivesnaps and its app version', () => {
    const parsed = parseFeedbackSubmission({ ...base, source: 'hivesnaps', appVersion: '1.4.0 (ios)' });
    expect(parsed.ok && parsed.value.source).toBe('hivesnaps');
    expect(parsed.ok && parsed.value.appVersion).toBe('1.4.0 (ios)');
  });

  it('treats a missing or unknown source like the web app, never as an error', () => {
    for (const source of [undefined, null, '', 'android', 'Mantequilla-Soft/other', 42, { repo: 'x/y' }, ['hivesnaps']]) {
      const parsed = parseFeedbackSubmission({ ...base, source, appVersion: '9.9.9' });
      expect(parsed.ok).toBe(true);
      expect(parsed.ok && parsed.value.source).toBeNull();
      expect(parsed.ok && parsed.value.appVersion).toBeNull();
    }
  });

  it('ignores a repo field in the request', () => {
    const parsed = parseFeedbackSubmission({ ...base, source: 'hivesnaps', repo: 'evil/repo' });
    expect(parsed.ok && JSON.stringify(parsed.value)).not.toContain('evil');
  });

  it('keeps the app version to one short sanitized line', () => {
    const v = (appVersion: unknown) => {
      const parsed = parseFeedbackSubmission({ ...base, source: 'hivesnaps', appVersion });
      return parsed.ok ? parsed.value.appVersion : 'error';
    };
    expect(v('1.4.0\n**Hive user:** admin')).toBe('1.4.0 **Hive user:** admin');
    expect(v('1.0 `x` <img>')).toBe('1.0 x img');
    expect(v('x'.repeat(200))).toHaveLength(APP_VERSION_MAX);
    expect(v('   ')).toBeNull();
    expect(v(140)).toBeNull();
    expect(v(undefined)).toBeNull();
  });

  it('adds a From line for HiveSnaps notes and keeps web notes unchanged', () => {
    const input = {
      title: 'Crash',
      body: 'It closes.',
      category: 'bug' as const,
      pageUrl: null,
      hiveUsername: 'alice',
      userAgent: 'okhttp/4.12',
    };
    const app = buildFeedbackIssue({ ...input, source: 'hivesnaps', appVersion: '1.4.0 (ios)' });
    expect(app.body.split('\n')[0]).toBe('**From:** HiveSnaps app 1.4.0 (ios)');
    expect(app.labels).toEqual(['feedback', 'bug']);

    const noVersion = buildFeedbackIssue({ ...input, source: 'hivesnaps', appVersion: null });
    expect(noVersion.body.split('\n')[0]).toBe('**From:** HiveSnaps app');

    const web = buildFeedbackIssue(input);
    expect(web.body).not.toContain('**From:**');
    expect(web.body.split('\n')[0]).toBe('**Category:** bug');
  });
});
