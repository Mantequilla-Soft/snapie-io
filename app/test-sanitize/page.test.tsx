import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));

vi.mock('./TestSanitizeDemo', () => ({
  default: function TestSanitizeDemo() {
    return 'Text Sanitization Test';
  },
}));

import TestSanitizeDemo from './TestSanitizeDemo';
import TestSanitizePage from './page';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('/test-sanitize', () => {
  it('returns 404 in production and does not render the demo', () => {
    vi.stubEnv('NODE_ENV', 'production');
    expect(() => TestSanitizePage()).toThrow('NEXT_NOT_FOUND');
  });

  it('renders the sanitizer demo under development', () => {
    vi.stubEnv('NODE_ENV', 'development');
    const element = TestSanitizePage() as { type: unknown };
    expect(element.type).toBe(TestSanitizeDemo);
  });
});
