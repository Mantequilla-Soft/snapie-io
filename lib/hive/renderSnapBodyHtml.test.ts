import { describe, it, expect } from 'vitest';
import { renderSnapBodyHtml } from './renderSnapBodyHtml';

describe('renderSnapBodyHtml', () => {
  it('returns sanitized html for the text half of a snap', () => {
    const html = renderSnapBodyHtml('hello **world**', 'alice');
    expect(html).toContain('hello');
    expect(html).toContain('world');
    expect(html).not.toContain('**');
  });

  it('returns an empty string when the body is only a photo', () => {
    const html = renderSnapBodyHtml('![pic](https://images.hive.blog/x.jpg)', 'alice');
    expect(html).toBe('');
  });
});
