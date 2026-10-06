// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { afterPriorityImage, scheduleAfterPriorityImage } from './afterPriorityImage';

function pendingImage(): HTMLImageElement {
  const img = document.createElement('img');
  img.setAttribute('fetchpriority', 'high');
  Object.defineProperty(img, 'complete', { configurable: true, get: () => false });
  document.body.appendChild(img);
  return img;
}

afterEach(() => {
  document.body.innerHTML = '';
  vi.useRealTimers();
});

describe('afterPriorityImage', () => {
  it('resolves immediately when the page has no priority image', async () => {
    await expect(afterPriorityImage()).resolves.toBeUndefined();
  });

  it('resolves immediately when the priority image is already complete', async () => {
    const img = document.createElement('img');
    img.setAttribute('fetchpriority', 'high');
    Object.defineProperty(img, 'complete', { configurable: true, get: () => true });
    document.body.appendChild(img);
    await expect(afterPriorityImage()).resolves.toBeUndefined();
  });

  it('waits for load, and also settles on error', async () => {
    const loaded = pendingImage();
    let loadDone = false;
    const loadPending = afterPriorityImage().then(() => {
      loadDone = true;
    });
    await Promise.resolve();
    expect(loadDone).toBe(false);
    loaded.dispatchEvent(new Event('load'));
    await loadPending;

    document.body.innerHTML = '';
    const failed = pendingImage();
    const errorPending = afterPriorityImage();
    failed.dispatchEvent(new Event('error'));
    await expect(errorPending).resolves.toBeUndefined();
  });

  it('resolves on the 2500ms timeout when the priority image never settles', async () => {
    vi.useFakeTimers();
    pendingImage();
    let resolved = false;
    const pending = afterPriorityImage().then(() => {
      resolved = true;
    });
    await vi.advanceTimersByTimeAsync(2499);
    expect(resolved).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await pending;
    expect(resolved).toBe(true);
  });
});

describe('scheduleAfterPriorityImage', () => {
  it('does not start until the priority image loads, and a cancel skips the start', async () => {
    const img = pendingImage();
    const started: string[] = [];
    const cancel = scheduleAfterPriorityImage(() => started.push('held'));
    scheduleAfterPriorityImage(() => started.push('kept'));
    await Promise.resolve();
    expect(started).toEqual([]);
    cancel();
    img.dispatchEvent(new Event('load'));
    await Promise.resolve();
    await Promise.resolve();
    expect(started).toEqual(['kept']);
  });

  it('starts immediately when nothing with fetchpriority=high is loading', () => {
    const started: string[] = [];
    scheduleAfterPriorityImage(() => started.push('now'));
    expect(started).toEqual(['now']);
  });
});
