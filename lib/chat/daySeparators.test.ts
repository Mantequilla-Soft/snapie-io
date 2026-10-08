import { describe, expect, it } from 'vitest';
import {
  formatDaySeparatorLabel,
  messageIdsWithDaySeparator,
  shouldShowDaySeparator,
} from './daySeparators';

/** Local wall-clock time, so the assertions hold in any timezone. */
function atLocal(year: number, monthIndex: number, day: number, hour: number, minute = 0): string {
  return new Date(year, monthIndex, day, hour, minute, 0, 0).toISOString();
}

describe('chat day separators', () => {
  const now = new Date(2026, 9, 8, 15, 0, 0);

  it('labels today, yesterday, and a short date in the viewer timezone', () => {
    expect(formatDaySeparatorLabel(atLocal(2026, 9, 8, 9, 5), now)).toBe('Today');
    expect(formatDaySeparatorLabel(atLocal(2026, 9, 7, 23, 40), now)).toBe('Yesterday');

    const older = atLocal(2026, 9, 6, 12);
    expect(formatDaySeparatorLabel(older, now)).toBe(
      new Date(older).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
    );

    const lastYear = atLocal(2025, 9, 7, 12);
    expect(formatDaySeparatorLabel(lastYear, now)).toBe(
      new Date(lastYear).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }),
    );
  });

  it('splits on the local calendar day, including across a UTC midnight', () => {
    const late = atLocal(2026, 9, 7, 23, 30);
    const earlyNext = atLocal(2026, 9, 8, 0, 30);
    expect(shouldShowDaySeparator(late, earlyNext)).toBe(true);

    const morning = atLocal(2026, 9, 7, 1, 0);
    const evening = atLocal(2026, 9, 7, 23, 0);
    expect(shouldShowDaySeparator(morning, evening)).toBe(false);
  });

  it('marks the first message and each later day change, once per day', () => {
    const ids = messageIdsWithDaySeparator([
      { _id: 'a', createdAt: atLocal(2026, 9, 6, 10) },
      { _id: 'b', createdAt: atLocal(2026, 9, 6, 18) },
      { _id: 'c', createdAt: atLocal(2026, 9, 7, 9) },
      { _id: 'd', createdAt: atLocal(2026, 9, 8, 9) },
    ]);
    expect([...ids]).toEqual(['a', 'c', 'd']);
  });

  it('skips a separator when the current timestamp is not a date', () => {
    expect(shouldShowDaySeparator(undefined, 'not-a-date')).toBe(false);
    expect(formatDaySeparatorLabel('not-a-date', now)).toBe('');
    expect(shouldShowDaySeparator('not-a-date', atLocal(2026, 9, 8, 9))).toBe(true);
  });
});
