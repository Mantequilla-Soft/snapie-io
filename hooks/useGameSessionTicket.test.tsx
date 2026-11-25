// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

vi.mock('@/lib/games/scoreClient', () => ({
  requestGameTicket: vi.fn(),
}));

import { requestGameTicket } from '@/lib/games/scoreClient';
import { useGameSessionTicket } from './useGameSessionTicket';

const request = vi.mocked(requestGameTicket);

describe('useGameSessionTicket', () => {
  it('keeps a ticket that was issued for the run', async () => {
    request.mockReset();
    request.mockResolvedValue('ticket-1');
    const { result } = renderHook(() => useGameSessionTicket('alice', 'snapie-rush', 'session-1'));
    await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
    await expect(result.current('session-1')).resolves.toBe('ticket-1');
    await expect(result.current('session-1')).resolves.toBe('ticket-1');
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('asks again after a failed ticket instead of keeping the failure', async () => {
    request.mockReset();
    let resolveFirst: (value: string | null) => void = () => {};
    request.mockReturnValueOnce(new Promise((resolve) => {
      resolveFirst = resolve;
    }));
    const { result } = renderHook(() => useGameSessionTicket('alice', 'snapie-rush', 'session-1'));
    await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
    const early = result.current('session-1');
    resolveFirst(null);
    await expect(early).resolves.toBeNull();
    request.mockResolvedValueOnce('ticket-2');
    await expect(result.current('session-1')).resolves.toBe('ticket-2');
    expect(request).toHaveBeenCalledTimes(2);
  });
});
