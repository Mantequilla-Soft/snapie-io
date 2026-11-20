process.env.TZ = 'America/Los_Angeles';

import { describe, expect, it } from 'vitest';
import {
  normalizeHiveTimestamp,
  parseHiveDate,
  parseHiveDateMs,
} from './hiveTimestamp';

describe('hiveTimestamp', () => {
  it('treats a bare Hive timestamp as UTC (evening PT post is prior local day)', () => {
    // 2026-11-15T01:48:00 UTC == 2026-11-14 17:48 America/Los_Angeles
    expect(normalizeHiveTimestamp('2026-11-15T01:48:00')).toBe('2026-11-15T01:48:00Z');
    expect(parseHiveDate('2026-11-15T01:48:00').toISOString()).toBe('2026-11-15T01:48:00.000Z');
    expect(parseHiveDateMs('2026-11-15T01:48:00')).toBe(Date.parse('2026-11-15T01:48:00Z'));
    expect(
      parseHiveDate('2026-11-15T01:48:00').toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      }),
    ).toBe('Nov 14, 2026');
  });

  it('leaves an explicit Z unchanged', () => {
    expect(normalizeHiveTimestamp('2026-11-15T01:48:00Z')).toBe('2026-11-15T01:48:00Z');
    expect(parseHiveDate('2026-11-15T01:48:00Z').toISOString()).toBe('2026-11-15T01:48:00.000Z');
    expect(parseHiveDateMs('2026-11-15T01:48:00Z')).toBe(Date.parse('2026-11-15T01:48:00Z'));
  });

  it('leaves numeric offsets unchanged', () => {
    expect(normalizeHiveTimestamp('2026-11-15T01:48:00+00:00')).toBe('2026-11-15T01:48:00+00:00');
    expect(normalizeHiveTimestamp('2026-11-14T17:48:00-08:00')).toBe('2026-11-14T17:48:00-08:00');
    expect(parseHiveDate('2026-11-15T01:48:00+00:00').toISOString()).toBe('2026-11-15T01:48:00.000Z');
    expect(parseHiveDate('2026-11-14T17:48:00-08:00').toISOString()).toBe('2026-11-15T01:48:00.000Z');
    expect(parseHiveDateMs('2026-11-15T01:48:00+00:00')).toBe(Date.parse('2026-11-15T01:48:00Z'));
  });

  it('rejects empty and unparseable values for ms helper', () => {
    expect(normalizeHiveTimestamp('')).toBe('');
    expect(normalizeHiveTimestamp('   ')).toBe('');
    expect(parseHiveDateMs('')).toBeNull();
    expect(parseHiveDateMs('   ')).toBeNull();
    expect(parseHiveDateMs('not-a-date')).toBeNull();
    expect(parseHiveDateMs(undefined)).toBeNull();
    expect(parseHiveDateMs(null)).toBeNull();
  });

  it('copies a Date and never throws on a missing value', () => {
    const d = new Date('2026-11-15T01:48:00Z');
    const copy = parseHiveDate(d);
    expect(copy).not.toBe(d);
    expect(copy.getTime()).toBe(d.getTime());
    expect(Number.isNaN(parseHiveDate(undefined).getTime())).toBe(true);
    expect(Number.isNaN(parseHiveDate(null).getTime())).toBe(true);
  });
});
