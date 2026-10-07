import { checkRateLimit, type RateLimitEntry } from '@/lib/http/rateLimit';

export const FEEDBACK_LIMIT = 5;
export const FEEDBACK_WINDOW_MS = 60 * 60 * 1000;

const buckets = new Map<string, RateLimitEntry>();

/** IP, plus the Hive username when a verified session is present. */
export function feedbackRateKey(ip: string, hiveUsername: string | null): string {
  return hiveUsername ? `${ip}|${hiveUsername}` : `${ip}|guest`;
}

export function allowFeedback(key: string, now = Date.now()): boolean {
  return checkRateLimit(buckets, key, FEEDBACK_LIMIT, FEEDBACK_WINDOW_MS, now);
}

export function resetFeedbackLimitForTests(): void {
  buckets.clear();
}
