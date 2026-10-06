// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { afterLcpPaint } from './afterLcpPaint';

afterEach(() => {
  document.body.innerHTML = '';
  vi.useRealTimers();
});

describe('afterLcpPaint', () => {
  it('waits for the priority image even if a text LCP entry already exists', async () => {
    const img = document.createElement('img');
    img.setAttribute('fetchpriority', 'high');
    Object.defineProperty(img, 'complete', { configurable: true, get: () => false });
    document.body.appendChild(img);
    vi.spyOn(performance, 'getEntriesByType').mockReturnValue([{} as PerformanceEntry]);

    let resolved = false;
    const pending = afterLcpPaint().then(() => {
      resolved = true;
    });
    await Promise.resolve();
    expect(resolved).toBe(false);
    img.dispatchEvent(new Event('load'));
    await pending;
    expect(resolved).toBe(true);
  });

  it('resolves immediately when the page has no priority image', async () => {
    await expect(afterLcpPaint()).resolves.toBeUndefined();
  });
});
