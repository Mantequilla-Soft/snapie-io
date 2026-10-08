import { afterEach, describe, expect, it } from 'vitest';
import { beginApproval, endApproval, resetApprovalOverlayForTests, suppressApproval } from './approvalOverlay';

afterEach(() => {
  resetApprovalOverlayForTests();
});

describe('approval overlay', () => {
  it('shows the first request and hides when it finishes', () => {
    expect(beginApproval()).toBe(true);
    expect(endApproval()).toBe(true);
  });

  it('keeps a dismiss in place while a queued request is still running', () => {
    expect(beginApproval()).toBe(true);
    suppressApproval();
    expect(beginApproval()).toBe(false);
    expect(endApproval()).toBe(false);
    expect(endApproval()).toBe(true);
    expect(beginApproval()).toBe(true);
    endApproval();
  });
});
