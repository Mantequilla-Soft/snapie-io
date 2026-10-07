import { NextRequest, NextResponse } from 'next/server';
import { assertFeedbackConfigured, createFeedbackIssue, FeedbackGithubError } from '@/lib/feedback/github';
import { resolveFeedbackHiveUsername } from '@/lib/feedback/identity';
import { allowFeedback, feedbackRateKey } from '@/lib/feedback/limit';
import { buildFeedbackIssue, FEEDBACK_RAW_MAX, parseFeedbackSubmission, truncateUserAgent } from '@/lib/feedback/model';
import { trustedClientIp } from '@/lib/http/rateLimit';

export const runtime = 'nodejs';

const NO_STORE = { 'Cache-Control': 'no-store' };

function jsonError(error: string, status: number, extra?: Record<string, string>) {
  return NextResponse.json({ error }, { status, headers: { ...NO_STORE, ...extra } });
}

/**
 * Accept in-app feedback and open a GitHub issue.
 * The token stays in GITHUB_FEEDBACK_TOKEN. Hive username is taken from a
 * verified chat JWT or Snapie Auth session; everyone else is a guest.
 */
export async function POST(request: NextRequest) {
  let raw = '';
  try {
    raw = await request.text();
  } catch {
    return jsonError('Add a short title and a message.', 400);
  }
  if (raw.length > FEEDBACK_RAW_MAX) {
    return jsonError('That message is too long.', 413);
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return jsonError('Add a short title and a message.', 400);
  }

  const parsed = parseFeedbackSubmission(payload);
  if (!parsed.ok) return jsonError(parsed.error, 400);

  try {
    assertFeedbackConfigured();
  } catch (err) {
    if (err instanceof FeedbackGithubError && err.status === 503) {
      return jsonError("Feedback isn't available right now.", 503);
    }
    throw err;
  }

  const hiveUsername = await resolveFeedbackHiveUsername(request.headers);
  const ip = trustedClientIp(request.headers);
  if (!allowFeedback(feedbackRateKey(ip, hiveUsername))) {
    return jsonError(
      "You've sent several notes recently. Please try again in a little while.",
      429,
      { 'Retry-After': '3600' },
    );
  }

  const issue = buildFeedbackIssue({
    ...parsed.value,
    hiveUsername,
    userAgent: truncateUserAgent(request.headers.get('user-agent')),
  });

  try {
    const created = await createFeedbackIssue(issue);
    return NextResponse.json({ url: created.url }, { status: 201, headers: NO_STORE });
  } catch (err) {
    if (err instanceof FeedbackGithubError && err.status === 503) {
      return jsonError("Feedback isn't available right now.", 503);
    }
    console.error('[feedback] issue create failed');
    return jsonError("We couldn't send that. Please try again.", 502);
  }
}
