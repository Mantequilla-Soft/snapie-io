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

  it('resolves when the priority image errors', async () => {
    const img = document.createElement('img');
    img.setAttribute('fetchpriority', 'high');
    Object.defineProperty(img, 'complete', { configurable: true, get: () => false });
    document.body.appendChild(img);

    const pending = afterLcpPaint();
    img.dispatchEvent(new Event('error'));
    await expect(pending).resolves.toBeUndefined();
  });

  it('resolves on the 2500ms timeout when the priority image never settles', async () => {
    vi.useFakeTimers();
    const img = document.createElement('img');
    img.setAttribute('fetchpriority', 'high');
    Object.defineProperty(img, 'complete', { configurable: true, get: () => false });
    document.body.appendChild(img);

    let resolved = false;
    const pending = afterLcpPaint().then(() => {
      resolved = true;
    });
    await vi.advanceTimersByTimeAsync(2499);
    expect(resolved).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await pending;
    expect(resolved).toBe(true);
  });
});
