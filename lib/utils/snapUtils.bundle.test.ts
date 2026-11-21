import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// snapUtils is on the home feed's client path. Importing the @snapie/renderer
// root there ships @hiveio/content-renderer, DOMPurify and the markdown parser
// with the first page and costs main-thread time (#344).
describe('snapUtils bundle weight', () => {
  it('only imports the light 3Speak helper subpath from @snapie/renderer', () => {
    const src = readFileSync(join(__dirname, 'snapUtils.ts'), 'utf8');
    expect(src).not.toMatch(/from\s+["']@snapie\/renderer["']/);
    expect(src).toMatch(/from\s+["']@snapie\/renderer\/speak-audio["']/);
  });
});
