import { describe, expect, it } from 'vitest';
import {
  FEEDBACK_BODY_MAX,
  FEEDBACK_TITLE_MAX,
  USER_AGENT_MAX,
  buildFeedbackIssue,
  parseFeedbackSubmission,
  sanitizePageUrl,
  truncateUserAgent,
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
