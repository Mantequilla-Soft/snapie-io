// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { useEffect } from 'react';

const ensureAioha = vi.fn();
const hasStoredAiohaSession = vi.fn();
const onAiohaReady = vi.fn();
const loadRealAiohaReactUi = vi.fn();

vi.mock('@/lib/hive/aioha', () => ({
  ensureAioha: () => ensureAioha(),
  hasStoredAiohaSession: () => hasStoredAiohaSession(),
  onAiohaReady: (cb: (aioha: unknown) => void) => onAiohaReady(cb),
}));

vi.mock('@/lib/aioha/load-real', () => ({
  loadRealAiohaReactUi: () => loadRealAiohaReactUi(),
}));

import { AiohaModal, AiohaProvider, useAioha } from './facade-react-ui';

function UserReadout() {
  const { user } = useAioha();
  return <div>{user ?? 'signed-out'}</div>;
}

beforeEach(() => {
  cleanup();
  ensureAioha.mockReset();
  hasStoredAiohaSession.mockReset();
  onAiohaReady.mockReset();
  loadRealAiohaReactUi.mockReset();
  hasStoredAiohaSession.mockReturnValue(false);
  onAiohaReady.mockImplementation(() => () => {});
});

describe('AiohaProvider', () => {
  it('leaves the library unloaded when there is no stored session', () => {
    render(
      <AiohaProvider>
        <UserReadout />
      </AiohaProvider>,
    );
    expect(screen.getByText('signed-out')).toBeTruthy();
    expect(ensureAioha).not.toHaveBeenCalled();
  });

  it('restores a stored session after mount and publishes the username', async () => {
    hasStoredAiohaSession.mockReturnValue(true);
    const instance = {
      getCurrentUser: () => 'alice',
      getCurrentProvider: () => 'keychain',
      getOtherLogins: () => ({}),
      on: vi.fn(),
      off: vi.fn(),
      logout: vi.fn(),
    };
    ensureAioha.mockResolvedValue(instance);
    onAiohaReady.mockImplementation((cb: (aioha: unknown) => void) => {
      queueMicrotask(() => cb(instance));
      return () => {};
    });

    render(
      <AiohaProvider>
        <UserReadout />
      </AiohaProvider>,
    );

    expect(await screen.findByText('alice')).toBeTruthy();
    expect(ensureAioha).toHaveBeenCalledTimes(1);
  });

  it('publishes the stored username before the wallet library resolves', () => {
    hasStoredAiohaSession.mockReturnValue(true);
    localStorage.setItem('aiohaUsername', 'alice');
    localStorage.setItem('aiohaProvider', 'keychain');
    // The chunk never arrives. The username still has to be visible so
    // session restore does not wait on @aioha/aioha.
    ensureAioha.mockReturnValue(new Promise(() => {}));
    const seen: Array<string | undefined> = [];
    function Probe() {
      const { user } = useAioha();
      useEffect(() => {
        seen.push(user);
      }, [user]);
      return <div>{user ?? 'signed-out'}</div>;
    }
    render(
      <AiohaProvider>
        <Probe />
      </AiohaProvider>,
    );
    expect(screen.getByText('alice')).toBeTruthy();
    expect(seen.at(-1)).toBe('alice');
    expect(ensureAioha).toHaveBeenCalledTimes(1);
  });
});

describe('AiohaModal', () => {
  it('loads the real wallet modal only while it is displayed', async () => {
    function RealModal({ displayed }: { displayed?: boolean }) {
      useEffect(() => {}, [displayed]);
      return <div>wallet providers</div>;
    }
    const instance = { getCurrentUser: () => undefined };
    ensureAioha.mockResolvedValue(instance);
    loadRealAiohaReactUi.mockResolvedValue({
      AiohaProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
      AiohaModal: RealModal,
    });

    const { rerender } = render(<AiohaModal displayed={false} />);
    expect(screen.queryByText('wallet providers')).toBeNull();
    expect(ensureAioha).not.toHaveBeenCalled();

    rerender(<AiohaModal displayed />);
    expect(await screen.findByText('wallet providers')).toBeTruthy();
    expect(ensureAioha).toHaveBeenCalledTimes(1);
    expect(loadRealAiohaReactUi).toHaveBeenCalledTimes(1);
  });
});
