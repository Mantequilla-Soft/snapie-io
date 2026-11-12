// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ChakraProvider } from '@chakra-ui/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import WalletShortcutPage from './page';
import { metadata } from './layout';

const mocks = vi.hoisted(() => ({
  username: null as string | null,
  replace: vi.fn(),
  openLoginModal: vi.fn(),
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: mocks.replace }) }));
vi.mock('@/hooks/useCurrentUser', () => ({
  useCurrentUser: () => ({ username: mocks.username, isLoggedIn: !!mocks.username }),
}));
vi.mock('@/contexts/LoginModalContext', () => ({
  useLoginModal: () => ({ openLoginModal: mocks.openLoginModal }),
}));

const renderPage = () => render(<ChakraProvider><WalletShortcutPage /></ChakraProvider>);

beforeEach(() => {
  mocks.username = null;
  mocks.replace.mockReset();
  mocks.openLoginModal.mockReset();
});
afterEach(cleanup);

describe('/wallet shortcut', () => {
  it('sends a signed-in user to their own wallet', () => {
    mocks.username = 'alice';
    renderPage();
    expect(mocks.replace).toHaveBeenCalledWith('/@alice/wallet');
  });

  it('asks a guest to log in', () => {
    renderPage();
    expect(mocks.replace).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }));
    expect(mocks.openLoginModal).toHaveBeenCalledTimes(1);
  });

  it('is kept out of the index', () => {
    expect(metadata.robots).toEqual({ index: false, follow: true });
  });
});
