const DEFAULT_REPO = 'Mantequilla-Soft/snapie-io';

const LABEL_META: Record<string, { color: string; description: string }> = {
  feedback: { color: '5319e7', description: 'Submitted from the Snapie app' },
  bug: { color: 'd73a4a', description: 'Bug report from the Snapie app' },
  idea: { color: '0e8a16', description: 'Idea from the Snapie app' },
};

export class FeedbackGithubError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'FeedbackGithubError';
    this.status = status;
  }
}

export function feedbackRepo(): string {
  const raw = process.env.GITHUB_FEEDBACK_REPO?.trim();
  if (!raw) return DEFAULT_REPO;
  if (!/^[\w.-]+\/[\w.-]+$/.test(raw)) {
    throw new FeedbackGithubError(503, 'bad_repo');
  }
  return raw;
}

interface IssueDraft {
  title: string;
  body: string;
  labels: string[];
}

async function githubFetch(path: string, token: string, init: RequestInit): Promise<Response> {
  return fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'snapie-feedback',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    redirect: 'error',
    signal: AbortSignal.timeout(10_000),
  });
}

async function missingLabel(res: Response): Promise<boolean> {
  if (res.status !== 422) return false;
  const data = (await res.json().catch(() => null)) as { message?: unknown; errors?: unknown } | null;
  if (!data) return false;
  if (typeof data.message === 'string' && /label/i.test(data.message)) return true;
  if (!Array.isArray(data.errors)) return false;
  return data.errors.some((err) => !!err && typeof err === 'object' && (err as { field?: unknown }).field === 'labels');
}

async function ensureLabel(repo: string, token: string, name: string): Promise<void> {
  const meta = LABEL_META[name] ?? { color: 'ededed', description: name };
  const res = await githubFetch(`/repos/${repo}/labels`, token, {
    method: 'POST',
    body: JSON.stringify({ name, color: meta.color, description: meta.description }),
  });
  if (res.status === 201 || res.status === 422) {
    await res.arrayBuffer().catch(() => undefined);
    return;
  }
  await res.arrayBuffer().catch(() => undefined);
  if (!res.ok) console.error('[feedback] label create failed', name, res.status);
}

async function postIssue(repo: string, token: string, draft: IssueDraft): Promise<Response> {
  const payload: { title: string; body: string; labels?: string[] } = {
    title: draft.title,
    body: draft.body,
  };
  if (draft.labels.length > 0) payload.labels = draft.labels;
  return githubFetch(`/repos/${repo}/issues`, token, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function assertFeedbackConfigured(): void {
  if (!process.env.GITHUB_FEEDBACK_TOKEN?.trim()) {
    throw new FeedbackGithubError(503, 'not_configured');
  }
  feedbackRepo();
}

export async function createFeedbackIssue(draft: IssueDraft): Promise<{ url: string | null }> {
  assertFeedbackConfigured();
  const token = process.env.GITHUB_FEEDBACK_TOKEN!.trim();
  const repo = feedbackRepo();
  let res = await postIssue(repo, token, draft);
  if (await missingLabel(res)) {
    for (const label of draft.labels) {
      await ensureLabel(repo, token, label);
    }
    res = await postIssue(repo, token, draft);
    if (await missingLabel(res)) {
      res = await postIssue(repo, token, { ...draft, labels: [] });
    }
  }

  if (!res.ok) throw new FeedbackGithubError(502, 'github_failed');

  const data = (await res.json().catch(() => null)) as { html_url?: unknown } | null;
  const url = typeof data?.html_url === 'string' ? data.html_url : null;
  if (url && !url.startsWith('https://github.com/')) return { url: null };
  return { url };
}
