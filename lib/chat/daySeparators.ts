/**
 * Day breaks in the chat message list.
 *
 * Boundaries use the viewer's local calendar day. A message at 11:30pm and
 * the next at 12:30am are different days even when a UTC date would group
 * them together, and the reverse is true for an evening that is already the
 * next UTC date.
 */

export function formatDaySeparatorLabel(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';

  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startMessage = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round((startToday.getTime() - startMessage.getTime()) / 86_400_000);

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';

  const sameYear = date.getFullYear() === now.getFullYear();
  return date.toLocaleDateString(undefined, sameYear
    ? { month: 'short', day: 'numeric' }
    : { month: 'short', day: 'numeric', year: 'numeric' });
}

function localDayParts(iso: string): { year: number; month: number; day: number } | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return { year: date.getFullYear(), month: date.getMonth(), day: date.getDate() };
}

function sameLocalDay(a: { year: number; month: number; day: number }, b: { year: number; month: number; day: number }): boolean {
  return a.year === b.year && a.month === b.month && a.day === b.day;
}

/** True for the first dated message and whenever the local calendar day changes. */
export function shouldShowDaySeparator(previousCreatedAt: string | null | undefined, createdAt: string): boolean {
  const current = localDayParts(createdAt);
  if (!current) return false;
  if (!previousCreatedAt) return true;
  const previous = localDayParts(previousCreatedAt);
  if (!previous) return true;
  return !sameLocalDay(previous, current);
}

/** Ids of messages that should render a day separator above them, in list order. */
export function messageIdsWithDaySeparator(messages: readonly { _id: string; createdAt: string }[]): Set<string> {
  const ids = new Set<string>();
  for (let i = 0; i < messages.length; i++) {
    const previous = i > 0 ? messages[i - 1].createdAt : undefined;
    if (shouldShowDaySeparator(previous, messages[i].createdAt)) ids.add(messages[i]._id);
  }
  return ids;
}
