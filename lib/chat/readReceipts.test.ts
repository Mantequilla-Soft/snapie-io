import { describe, it, expect } from 'vitest';
import { usesExplicitReadReceipts, newestCreatedAt, EXPLICIT_READ_HEADER } from '@/lib/chat/messages';

function reqWith(headers: Record<string, string> = {}) {
  return { headers: new Headers(headers) };
}

describe('usesExplicitReadReceipts', () => {
  it('is true when the client declares it posts its own receipts', () => {
    expect(usesExplicitReadReceipts(reqWith({ [EXPLICIT_READ_HEADER]: 'explicit' }))).toBe(true);
  });

  it('is case-insensitive about the header name', () => {
    expect(usesExplicitReadReceipts(reqWith({ 'X-Snapie-Chat-Read-Mode': 'explicit' }))).toBe(true);
  });

  it('is false for a legacy client that sends no header', () => {
    expect(usesExplicitReadReceipts(reqWith())).toBe(false);
  });

  it('is false for any other value, so a typo fails safe to legacy behaviour', () => {
    expect(usesExplicitReadReceipts(reqWith({ [EXPLICIT_READ_HEADER]: 'yes' }))).toBe(false);
  });
});

describe('newestCreatedAt', () => {
  it('finds the newest message regardless of page order', () => {
    const older = new Date('2026-07-01T00:00:00Z');
    const newer = new Date('2026-07-02T00:00:00Z');
    expect(newestCreatedAt([{ createdAt: newer }, { createdAt: older }])).toEqual(newer);
    expect(newestCreatedAt([{ createdAt: older }, { createdAt: newer }])).toEqual(newer);
  });

  it('is null for an empty page, so nothing is stamped', () => {
    expect(newestCreatedAt([])).toBeNull();
  });

  it('stamps what was delivered, never `now` — a message arriving mid-request is not skipped', () => {
    const delivered = new Date('2026-07-01T00:00:00Z');
    expect(newestCreatedAt([{ createdAt: delivered }])!.getTime()).toBe(delivered.getTime());
  });
});
