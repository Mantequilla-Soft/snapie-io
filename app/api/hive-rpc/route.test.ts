import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

describe('POST /api/hive-rpc', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('forwards a JSON-RPC batch array and returns per-item errors unchanged', async () => {
    const batch = [
      { jsonrpc: '2.0', id: 1, method: 'condenser_api.get_content', params: ['a', 'one'] },
      { jsonrpc: '2.0', id: 2, method: 'bridge.get_community', params: { name: 'hive-178315' } },
    ];
    const nodePayload = [
      { jsonrpc: '2.0', id: 1, error: { code: 1, message: 'Post a/one does not exist' } },
      { jsonrpc: '2.0', id: 2, result: { title: 'Snapie' } },
    ];
    const forwarded: unknown[] = [];

    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).includes('beacon.peakd.com')) {
        return { ok: false, json: async () => [] };
      }
      forwarded.push(JSON.parse(String(init?.body)));
      return { ok: true, json: async () => nodePayload };
    }));

    const { POST } = await import('./route');
    const response = await POST(new NextRequest('http://127.0.0.1/api/hive-rpc', {
      method: 'POST',
      body: JSON.stringify(batch),
      headers: { 'content-type': 'application/json' },
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(nodePayload);
    expect(forwarded.length).toBeGreaterThan(0);
    expect(forwarded.every((body) => JSON.stringify(body) === JSON.stringify(batch))).toBe(true);
  });
});
