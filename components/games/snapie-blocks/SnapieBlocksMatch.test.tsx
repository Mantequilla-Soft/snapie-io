// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ChakraProvider } from '@chakra-ui/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearSignDecline, isSignDeclined, rememberSignDecline } from '@/lib/hive/walletSign';
import { SnapieBlocksMatch } from './SnapieBlocksMatch';

const mocks = vi.hoisted(() => ({
  ensureSessionToken: vi.fn(),
}));

vi.mock('@/lib/points/client', () => ({
  ensureSessionToken: (...args: unknown[]) => mocks.ensureSessionToken(...args),
  POINTS_EARNED_EVENT: 'snapie:points-earned',
}));

vi.mock('./SnapieBlocks', () => ({
  SnapieBlocksBoard: () => null,
}));

if (typeof window.matchMedia !== 'function') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: () => false,
    }),
  });
}

function renderMatch(username: string | null) {
  return render(
    <ChakraProvider>
      <SnapieBlocksMatch username={username} />
    </ChakraProvider>,
  );
}

beforeEach(() => {
  sessionStorage.clear();
  clearSignDecline();
  mocks.ensureSessionToken.mockReset();
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (String(url).includes('/api/games/snapie-blocks/session')) {
      return { ok: true, json: async () => ({ token: 'guest-token' }) };
    }
    return { ok: false, json: async () => ({}) };
  }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('SnapieBlocksMatch points copy', () => {
  it('keeps the guest banner when nobody is logged in', async () => {
    renderMatch(null);
    expect(await screen.findByText(/Playing as a guest/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Enable Snapie Points' })).toBeNull();
    expect(mocks.ensureSessionToken).not.toHaveBeenCalled();
  });

  it('tells a logged-in user who skipped the signature, and enables points on request', async () => {
    rememberSignDecline();
    mocks.ensureSessionToken.mockImplementation(async (_username: string, opts?: { silent?: boolean }) => {
      if (opts?.silent) return null;
      return 'hive-token';
    });

    renderMatch('alice');

    expect(await screen.findByText(/skipped the signature/)).toBeTruthy();
    expect(screen.queryByText(/Playing as a guest/)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Enable Snapie Points' }));

    await waitFor(() => {
      expect(screen.getByText(/settled on the server/)).toBeTruthy();
    });
    expect(screen.queryByText(/skipped the signature/)).toBeNull();
    expect(isSignDeclined()).toBe(false);
    expect(mocks.ensureSessionToken).toHaveBeenLastCalledWith('alice');
  });
});
