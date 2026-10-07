import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFeedbackIssue, FeedbackGithubError } from './github';

const TOKEN = 'ghp_feedback_test_token_xyz';
const ISSUE = {
  title: '[Bug] Composer',
  body: '**Hive user:** alice\n\nhello',
  labels: ['feedback', 'bug'],
};

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

beforeEach(() => {
  process.env.GITHUB_FEEDBACK_TOKEN = TOKEN;
  delete process.env.GITHUB_FEEDBACK_REPO;
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.GITHUB_FEEDBACK_TOKEN;
  delete process.env.GITHUB_FEEDBACK_REPO;
});

describe('createFeedbackIssue', () => {
  it('does not call GitHub when the token is missing', async () => {
    delete process.env.GITHUB_FEEDBACK_TOKEN;
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(createFeedbackIssue(ISSUE)).rejects.toBeInstanceOf(FeedbackGithubError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('creates an issue with the server token and returns the issue url', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      expect(new Headers(init?.headers).get('authorization')).toBe(`Bearer ${TOKEN}`);
      return json({ html_url: 'https://github.com/Mantequilla-Soft/snapie-io/issues/42' }, 201);
    });
    vi.stubGlobal('fetch', fetchMock);

    const created = await createFeedbackIssue(ISSUE);
    expect(created.url).toBe('https://github.com/Mantequilla-Soft/snapie-io/issues/42');
    expect(String(fetchMock.mock.calls[0][0])).toBe('https://api.github.com/repos/Mantequilla-Soft/snapie-io/issues');
    const sent = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(sent.labels).toEqual(['feedback', 'bug']);
    expect(JSON.stringify(sent)).not.toContain(TOKEN);
  });

  it('creates missing labels and retries', async () => {
    const calls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      calls.push(`${init?.method} ${url}`);
      if (String(url).endsWith('/labels')) return json({ name: 'feedback' }, 201);
      if (calls.filter((call) => call.includes('/issues')).length === 1) {
        return json({
          message: 'Validation Failed',
          errors: [{ resource: 'Issue', field: 'labels', code: 'invalid' }],
        }, 422);
      }
      return json({ html_url: 'https://github.com/Mantequilla-Soft/snapie-io/issues/43' }, 201);
    }));

    const created = await createFeedbackIssue(ISSUE);
    expect(created.url).toBe('https://github.com/Mantequilla-Soft/snapie-io/issues/43');
    expect(calls.some((call) => call.includes('/labels'))).toBe(true);
  });

  it('still opens the issue when labels cannot be applied', async () => {
    const bodies: string[] = [];
    let issuePosts = 0;
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).endsWith('/labels')) return json({ name: 'bug' }, 201);
      issuePosts += 1;
      bodies.push(String(init?.body));
      if (issuePosts < 3) {
        return json({
          message: 'Label does not exist',
          errors: [{ field: 'labels' }],
        }, 422);
      }
      return json({ html_url: 'https://github.com/Mantequilla-Soft/snapie-io/issues/44' }, 201);
    }));

    const created = await createFeedbackIssue(ISSUE);
    expect(created.url).toBe('https://github.com/Mantequilla-Soft/snapie-io/issues/44');
    expect(JSON.parse(bodies[2]).labels).toBeUndefined();
  });

  it('uses GITHUB_FEEDBACK_REPO when it is owner/repo', async () => {
    process.env.GITHUB_FEEDBACK_REPO = 'Example-Org/widget';
    const fetchMock = vi.fn(async (url: string) => {
      expect(url).toBe('https://api.github.com/repos/Example-Org/widget/issues');
      return json({ html_url: 'https://github.com/Example-Org/widget/issues/45' }, 201);
    });
    vi.stubGlobal('fetch', fetchMock);
    await createFeedbackIssue(ISSUE);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('refuses a repo override that is not owner/repo', async () => {
    process.env.GITHUB_FEEDBACK_REPO = 'https://evil.example/repo';
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(createFeedbackIssue(ISSUE)).rejects.toMatchObject({ status: 503 });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
