import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { withTimeout } from './withTimeout';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('withTimeout', () => {
  it('resolves with the wrapped promise\'s value when it settles first', async () => {
    const result = withTimeout(Promise.resolve('done'), 1000);
    await expect(result).resolves.toBe('done');
  });

  it('rejects with the wrapped promise\'s error when it rejects first', async () => {
    const result = withTimeout(Promise.reject(new Error('boom')), 1000);
    await expect(result).rejects.toThrow('boom');
  });

  it('rejects once the timeout elapses if the promise never settles', async () => {
    const hung = new Promise(() => {});
    const result = withTimeout(hung, 1000, 'gave up waiting');
    const assertion = expect(result).rejects.toThrow('gave up waiting');
    await vi.advanceTimersByTimeAsync(1000);
    await assertion;
  });

  it('does not fire the timeout after the promise already resolved', async () => {
    const result = await withTimeout(Promise.resolve('fast'), 1000);
    expect(result).toBe('fast');
    // If the timer weren't cleared, this would be a dangling unhandled
    // rejection/timer left running — advancing time here should be a no-op.
    await vi.advanceTimersByTimeAsync(5000);
  });
});
