import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Notifications } from '@hiveio/dhive';
import {
  extractNotificationActor,
  formatNotificationTime,
  getNotificationActor,
  getNotificationPostKey,
  getNotificationRoute,
  getNotificationTypeLabel,
  normalizeNotificationPreviewText,
  parseHiveDate,
  truncatePreviewWords,
} from './notificationHelpers';

function note(partial: Partial<Notifications>): Notifications {
  return partial as Notifications;
}

afterEach(() => {
  vi.useRealTimers();
});

describe('notification routes and actors', () => {
  it('turns known frontend urls into author/permlink keys and in-app routes', () => {
    const post = note({ url: 'https://peakd.com/hive-106130/@alice/hello-world' });
    expect(getNotificationPostKey(post)).toBe('alice/hello-world');
    expect(getNotificationRoute(post)).toBe('/hive-106130/@alice/hello-world');

    const direct = note({ url: 'https://hive.blog/@bob/a-snap' });
    expect(getNotificationPostKey(direct)).toBe('bob/a-snap');
    expect(getNotificationRoute(direct)).toBe('/@bob/a-snap');

    const profile = note({ url: 'https://ecency.com/@carol' });
    expect(getNotificationPostKey(profile)).toBeNull();
    expect(getNotificationRoute(profile)).toBe('/@carol');

    const speak = note({ url: 'https://3speak.tv/watch?v=dave/my-video' });
    expect(getNotificationPostKey(speak)).toBe('dave/my-video');
    expect(getNotificationRoute(speak)).toBe('/@dave/my-video');
  });

  it('ignores transfers, unknown hosts, and missing urls', () => {
    expect(getNotificationPostKey(note({ url: 'trx:abc' }))).toBeNull();
    expect(getNotificationRoute(note({ url: 'trx:abc' }))).toBeNull();
    expect(getNotificationPostKey(note({ url: '/@alice/hello-world' }))).toBe('alice/hello-world');
    expect(getNotificationRoute(note({ url: '/@alice/hello-world' }))).toBe('/@alice/hello-world');
    expect(getNotificationPostKey(note({}))).toBeNull();
    expect(getNotificationRoute(note({}))).toBeNull();
    expect(getNotificationRoute(note({ url: 'not a url' }))).toBe('/@not a url');
  });

  it('reads the leading @name from a message', () => {
    expect(extractNotificationActor('@alice replied')).toBe('alice');
    expect(extractNotificationActor('no mention')).toBeNull();
    expect(extractNotificationActor()).toBeNull();
    expect(getNotificationActor(note({ msg: '@bob voted' }))).toBe('bob');
    expect(getNotificationTypeLabel('vote')).toBe('upvoted');
    expect(getNotificationTypeLabel('custom')).toBe('custom');
    expect(getNotificationTypeLabel('')).toBe('activity');
  });
});

describe('notification time and preview text', () => {
  it('parses Hive timestamps as UTC and formats a relative age', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-06T12:00:00Z'));
    expect(parseHiveDate().toISOString()).toBe('1970-01-01T00:00:00.000Z');
    expect(parseHiveDate('2026-10-06T11:00:00Z').toISOString()).toBe('2026-10-06T11:00:00.000Z');
    expect(parseHiveDate('2026-10-06T11:00:00').toISOString()).toBe('2026-10-06T11:00:00.000Z');

    expect(formatNotificationTime('')).toBe('');
    expect(formatNotificationTime('2026-10-06T11:59:30')).toBe('30s');
    expect(formatNotificationTime('2026-10-06T11:30:00')).toBe('30m');
    expect(formatNotificationTime('2026-10-06T08:00:00')).toBe('4h');
    expect(formatNotificationTime('2026-10-01T12:00:00')).toBe('5d');
    expect(formatNotificationTime('2026-08-01T12:00:00')).toBe('2mo');
    expect(formatNotificationTime('2024-10-06T12:00:00')).toBe('2y');
  });

  it('strips markdown and cuts the preview on a sentence when it can', () => {
    expect(normalizeNotificationPreviewText()).toBe('');
    const cleaned = normalizeNotificationPreviewText(
      'Hello **world** <b>x</b> ![alt](https://img) [link](https://x) `code` > quote',
    );
    expect(cleaned).toBe('Hello world x link quote');

    const words = Array.from({ length: 20 }, (_, i) => (i === 13 ? 'done.' : `w${i}`)).join(' ');
    expect(truncatePreviewWords(words).endsWith('done.…')).toBe(true);
    expect(truncatePreviewWords('short text')).toBe('short text');
    expect(truncatePreviewWords('   ')).toBe('');
    const long = Array.from({ length: 20 }, (_, i) => `w${i}`).join(' ');
    expect(truncatePreviewWords(long, 12, 16).split(' ').length).toBe(16);
  });
});
