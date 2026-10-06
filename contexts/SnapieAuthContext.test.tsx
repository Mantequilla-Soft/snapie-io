// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { SnapieAuthProvider, useSnapieAuth } from './SnapieAuthContext';

const mocks = vi.hoisted(() => ({
  getMe: vi.fn(),
  logout: vi.fn(),
  setSigningAuthMode: vi.fn(),
  setHiveUser: vi.fn(),
  getAccounts: vi.fn(),
}));

vi.mock('@/lib/snapie-auth/client', () => ({
  getMe: mocks.getMe,
  logout: mocks.logout,
}));

vi.mock('@/lib/hive/signing', () => ({
  setSigningAuthMode: mocks.setSigningAuthMode,
}));

vi.mock('@/lib/hive/hiveclient', () => ({
  default: { database: { getAccounts: mocks.getAccounts } },
}));

vi.mock('@/contexts/UserContext', () => ({
  useHiveUser: () => ({ setHiveUser: mocks.setHiveUser }),
}));

const USER = {
  id: 'u1',
  name: 'Tester',
  picture: null,
  hiveUsername: 'tester',
  custodyMode: 'custodial' as const,
  isAdmin: false,
  email: 'a@b.c',
  accountValueUsd: null,
  emancipationRequired: false,
};

function Probe() {
  const { isSnapieLoggedIn, isLoading, snapieUser } = useSnapieAuth();
  return (
    <div>
      <span data-testid="loading">{String(isLoading)}</span>
      <span data-testid="in">{String(isSnapieLoggedIn)}</span>
      <span data-testid="name">{snapieUser?.hiveUsername ?? ''}</span>
    </div>
  );
}

describe('SnapieAuthProvider session restore', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    mocks.getMe.mockReset();
    mocks.setSigningAuthMode.mockReset();
    mocks.setHiveUser.mockReset();
    mocks.getAccounts.mockReset();
    mocks.getAccounts.mockResolvedValue([]);
    localStorage.clear();
  });

  it('stays logged out when /auth/me returns no user', async () => {
    mocks.getMe.mockResolvedValue(null);

    render(<SnapieAuthProvider><Probe /></SnapieAuthProvider>);

    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'));
    expect(screen.getByTestId('in').textContent).toBe('false');
    expect(screen.getByTestId('name').textContent).toBe('');
    expect(mocks.setSigningAuthMode).not.toHaveBeenCalled();
    expect(mocks.getAccounts).not.toHaveBeenCalled();
  });

  it('restores a Snapie session when /auth/me returns a user', async () => {
    mocks.getMe.mockResolvedValue(USER);

    render(<SnapieAuthProvider><Probe /></SnapieAuthProvider>);

    await waitFor(() => expect(screen.getByTestId('in').textContent).toBe('true'));
    expect(screen.getByTestId('name').textContent).toBe('tester');
    expect(mocks.setSigningAuthMode).toHaveBeenCalledWith('snapie', 'tester');
    expect(screen.getByTestId('loading').textContent).toBe('false');
  });

  it('stays logged out when the session probe fails', async () => {
    mocks.getMe.mockRejectedValue(new Error('upstream'));

    render(<SnapieAuthProvider><Probe /></SnapieAuthProvider>);

    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'));
    expect(screen.getByTestId('in').textContent).toBe('false');
    expect(mocks.setSigningAuthMode).not.toHaveBeenCalled();
  });
});
