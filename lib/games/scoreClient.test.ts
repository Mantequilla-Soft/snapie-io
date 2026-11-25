import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/points/client', () => ({
  authenticatedFetch: vi.fn(),
  POINTS_EARNED_EVENT: 'snapie-points-earned',
}));

import { authenticatedFetch } from '@/lib/points/client';
import { requestGameTicket } from './scoreClient';

const fetchMock = vi.mocked(authenticatedFetch);

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

beforeEach(() => {
  fetchMock.mockReset();
});

describe('requestGameTicket', () => {
  it('stays silent when a session token is already available', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ticket: 'signed' }));
    await expect(requestGameTicket('alice', 'snapie-rush', 'session-1')).resolves.toBe('signed');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][3]).toEqual({ silent: true });
  });

  it('asks for a session when the silent request has no token, while the run is still young', async () => {
    fetchMock
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(jsonResponse({ ticket: 'signed' }));
    await expect(requestGameTicket('alice', 'snapie-rush', 'session-1')).resolves.toBe('signed');
    expect(fetchMock.mock.calls[1][3]).toEqual({ silent: false });
  });

  it('returns null when the user declines the session prompt', async () => {
    fetchMock.mockResolvedValue(null);
    await expect(requestGameTicket('alice', 'snapie-rush', 'session-1')).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('retries a thrown request once without prompting again', async () => {
    fetchMock
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce(jsonResponse({ ticket: 'signed' }));
    await expect(requestGameTicket('alice', 'snapie-rush', 'session-1')).resolves.toBe('signed');
    expect(fetchMock.mock.calls[1][3]).toEqual({ silent: true });
  });
});
