import { describe, expect, it, beforeEach } from 'vitest';
import { allowFeedback, feedbackRateKey, resetFeedbackLimitForTests, FEEDBACK_LIMIT, FEEDBACK_WINDOW_MS } from './limit';

describe('feedback rate limit', () => {
  beforeEach(() => {
    resetFeedbackLimitForTests();
  });

  it('keys guests and signed-in users separately', () => {
    expect(feedbackRateKey('203.0.113.8', null)).toBe('203.0.113.8|guest');
    expect(feedbackRateKey('203.0.113.8', 'alice')).toBe('203.0.113.8|alice');
  });

  it('allows five submissions an hour, then blocks until the window ends', () => {
    const key = feedbackRateKey('203.0.113.8', 'alice');
    for (let i = 0; i < FEEDBACK_LIMIT; i++) {
      expect(allowFeedback(key, 0)).toBe(true);
    }
    expect(allowFeedback(key, 10)).toBe(false);
    expect(allowFeedback(feedbackRateKey('203.0.113.8', null), 10)).toBe(true);
    expect(allowFeedback(key, FEEDBACK_WINDOW_MS)).toBe(true);
  });
});
