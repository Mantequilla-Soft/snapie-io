// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { afterPriorityImage, scheduleAfterPriorityImage, useAfterPriorityImage } from './afterPriorityImage';

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

  it('ignores a second settle after the timeout already resolved', async () => {
    vi.useFakeTimers();
    const img = pendingImage();
    const pending = afterPriorityImage();
    await vi.advanceTimersByTimeAsync(2500);
    await pending;
    img.dispatchEvent(new Event('load'));
    img.dispatchEvent(new Event('error'));
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

  it('starts immediately when the priority image is already complete', () => {
    const img = document.createElement('img');
    img.setAttribute('fetchpriority', 'high');
    Object.defineProperty(img, 'complete', { configurable: true, get: () => true });
    document.body.appendChild(img);
    const started: string[] = [];
    const cancel = scheduleAfterPriorityImage(() => started.push('done'));
    expect(started).toEqual(['done']);
    cancel();
  });
});

describe('useAfterPriorityImage', () => {
  it('stays false until the priority image loads, then flips in a transition', async () => {
    const img = pendingImage();
    const { result } = renderHook(() => useAfterPriorityImage());
    expect(result.current).toBe(false);
    img.dispatchEvent(new Event('load'));
    await waitFor(() => expect(result.current).toBe(true));
  });

  it('does not flip after unmount', async () => {
    const img = pendingImage();
    const { result, unmount } = renderHook(() => useAfterPriorityImage());
    unmount();
    img.dispatchEvent(new Event('load'));
    await Promise.resolve();
    await Promise.resolve();
    expect(result.current).toBe(false);
  });
});
