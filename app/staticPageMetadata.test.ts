import { describe, expect, it } from 'vitest';
import { metadata as blog } from './blog/layout';
import { metadata as shorts } from './shorts/layout';
import { metadata as changelog } from './changelog/layout';

describe('static page metadata', () => {
  const pages = { '/blog': blog, '/shorts': shorts, '/changelog': changelog };

  it.each(Object.entries(pages))('%s has a self-canonical and its own title', (path, meta) => {
    expect(meta.alternates?.canonical).toBe(path);
    expect(meta.title).toBeTruthy();
    expect(meta.title).not.toBe('Snapie');
    expect(meta.description).toBeTruthy();
  });

  it('titles are unique', () => {
    const titles = Object.values(pages).map((m) => m.title);
    expect(new Set(titles).size).toBe(titles.length);
  });
});
