import { describe, expect, it } from 'vitest';
import { afterPriorityImage, scheduleAfterPriorityImage } from './afterPriorityImage';

describe('afterPriorityImage without a document', () => {
  it('resolves immediately and starts scheduled work', async () => {
    await expect(afterPriorityImage()).resolves.toBeUndefined();
    const started: string[] = [];
    const cancel = scheduleAfterPriorityImage(() => started.push('now'));
    expect(started).toEqual(['now']);
    expect(cancel()).toBeUndefined();
  });
});
