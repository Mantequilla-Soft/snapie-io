import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware } from './middleware';

const run = (path: string) => middleware(new NextRequest(`https://snapie.io${path}`));

describe('middleware username canonicalisation', () => {
  it('redirects an uppercase @username to lowercase', () => {
    const res = run('/@SNAPIE');
    expect(res.status).toBe(308);
    expect(res.headers.get('location')).toBe('https://snapie.io/@snapie');
  });

  it('lowercases only the username, keeping permlink case and the query string', () => {
    const res = run('/@Snapie/Hello-World?x=1');
    expect(res.headers.get('location')).toBe('https://snapie.io/@snapie/Hello-World?x=1');
  });

  it('leaves a lowercase username and other paths alone', () => {
    expect(run('/@snapie').headers.get('location')).toBeNull();
    expect(run('/api/chat/Foo').headers.get('location')).toBeNull();
  });
});
