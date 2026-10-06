import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const fetchMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/combflow/client', () => {
  class CombflowHttpError extends Error {
    status: number;
    constructor(status: number) {
      super(`Combflow returned ${status}`);
      this.status = status;
    }
  }
  return {
    fetchCombflowPost: (...args: unknown[]) => fetchMock(...args),
    CombflowHttpError,
  };
});

import { CombflowHttpError } from '@/lib/combflow/client';
import { GET } from './route';

function call() {
  return GET(
    new NextRequest('http://localhost/api/combflow/post/meno/missing'),
    { params: { author: 'meno', permlink: 'missing' } },
  );
}

describe('GET /api/combflow/post', () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it('returns 200 for a post CombFlow has not classified', async () => {
    fetchMock.mockRejectedValue(new CombflowHttpError(404));

    const res = await call();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ error: 'Not found.' });
  });

  it('still forwards other CombFlow statuses', async () => {
    fetchMock.mockRejectedValue(new CombflowHttpError(500));

    const res = await call();

    expect(res.status).toBe(500);
  });

  it('returns 502 when CombFlow cannot be reached', async () => {
    fetchMock.mockRejectedValue(new Error('network'));

    const res = await call();

    expect(res.status).toBe(502);
  });
});