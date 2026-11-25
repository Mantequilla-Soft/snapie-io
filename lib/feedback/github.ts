import type { FeedbackSource } from './model';

const DEFAULT_REPO = 'Mantequilla-Soft/snapie-io';
const DEFAULT_HIVESNAPS_REPO = 'Mantequilla-Soft/hivesnaps';
const REPO_PATTERN = /^[\w.-]+\/[\w.-]+$/;

function labelMeta(name: string, appName: string): { color: string; description: string } {
  switch (name) {
    case 'feedback':
      return { color: '5319e7', description: `Submitted from the ${appName}` };
    case 'bug':
      return { color: 'd73a4a', description: `Bug report from the ${appName}` };
    case 'idea':
      return { color: '0e8a16', description: `Idea from the ${appName}` };
    default:
      return { color: 'ededed', description: name };
  }
}

export class FeedbackGithubError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'FeedbackGithubError';
    this.status = status;
  }
}

function repoFromEnv(raw: string | undefined, fallback: string): string {
  const value = raw?.trim();
  if (!value) return fallback;
  if (!REPO_PATTERN.test(value)) {
    throw new FeedbackGithubError(503, 'bad_repo');
  }
  return value;
}

export function feedbackRepo(): string {
  return repoFromEnv(process.env.GITHUB_FEEDBACK_REPO, DEFAULT_REPO);
}

export interface FeedbackTarget {
  repo: string;
  token: string;
  appName: string;
}

/**
 * Where a submission goes. Only this server-side mapping picks the repo and
 * token; nothing from the request is used beyond the parsed source.
 * A missing token or a bad repo name is a 503, never a fallback to another repo.
 */
export function feedbackTarget(source: FeedbackSource | null = null): FeedbackTarget {
  if (source === 'hivesnaps') {
    const token = (process.env.GITHUB_FEEDBACK_TOKEN_HIVESNAPS || process.env.GITHUB_FEEDBACK_TOKEN)?.trim();
    if (!token) throw new FeedbackGithubError(503, 'not_configured');
    return {
      repo: repoFromEnv(process.env.GITHUB_FEEDBACK_REPO_HIVESNAPS, DEFAULT_HIVESNAPS_REPO),
      token,
      appName: 'HiveSnaps app',
    };
  }
  const token = process.env.GITHUB_FEEDBACK_TOKEN?.trim();
  if (!token) throw new FeedbackGithubError(503, 'not_configured');
  return { repo: feedbackRepo(), token, appName: 'Snapie app' };
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

async function ensureLabel(repo: string, token: string, name: string, appName: string): Promise<void> {
  const meta = labelMeta(name, appName);
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

export function assertFeedbackConfigured(source: FeedbackSource | null = null): void {
  feedbackTarget(source);
}

export async function createFeedbackIssue(
  draft: IssueDraft,
  source: FeedbackSource | null = null,
): Promise<{ url: string | null }> {
  const { repo, token, appName } = feedbackTarget(source);
  let res = await postIssue(repo, token, draft);
  if (await missingLabel(res)) {
    for (const label of draft.labels) {
      await ensureLabel(repo, token, label, appName);
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
