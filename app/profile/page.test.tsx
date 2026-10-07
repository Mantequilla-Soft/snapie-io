// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { ChakraProvider } from '@chakra-ui/react';
import type { ReactNode } from 'react';
import ProfilePage from './page';

// Guest /profile used to render nothing: app/[username] returns null unless
// the segment starts with @, so a logged-out visit showed the site nav and
// an empty main area. This page is the auth gate (and the signed-in
// redirect) that replaces that blank shell.

const mocks = vi.hoisted(() => ({
  isLoggedIn: false,
  username: null as string | null,
  isLoading: false,
  openLoginModal: vi.fn(),
  replace: vi.fn(),
}));

vi.mock('@/hooks/useCurrentUser', () => ({
  useCurrentUser: () => ({
    isLoggedIn: mocks.isLoggedIn,
    username: mocks.username,
  }),
}));

vi.mock('@/contexts/SnapieAuthContext', () => ({
  useSnapieAuth: () => ({ isLoading: mocks.isLoading }),
}));

vi.mock('@/contexts/LoginModalContext', () => ({
  useLoginModal: () => ({ openLoginModal: mocks.openLoginModal }),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mocks.replace }),
}));

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children?: ReactNode }) => (
    <a href={href} {...rest}>{children}</a>
  ),
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

function renderPage() {
  return render(
    <ChakraProvider>
      <ProfilePage />
    </ChakraProvider>,
  );
}

beforeEach(() => {
  mocks.isLoggedIn = false;
  mocks.username = null;
  mocks.isLoading = false;
  mocks.openLoginModal.mockReset();
  mocks.replace.mockReset();
});

afterEach(cleanup);

describe('guest /profile', () => {
  it('shows a sign-in gate instead of an empty main area', () => {
    const { container } = renderPage();

    expect(screen.getByRole('heading', { name: 'Sign in to view your profile' })).toBeTruthy();
    expect(screen.getByText(/Google, email, or your Hive wallet/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Log in' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Create account' }).getAttribute('href')).toBe('/join');
    expect(container.textContent?.trim().length).toBeGreaterThan(0);
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it('opens the existing login modal from the gate', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }));
    expect(mocks.openLoginModal).toHaveBeenCalledTimes(1);
  });

  it('holds the main area while the session check is still in flight', () => {
    mocks.isLoading = true;
    const { container } = renderPage();

    expect(screen.getByRole('status').textContent).toContain('Checking session');
    expect(screen.queryByRole('heading', { name: 'Sign in to view your profile' })).toBeNull();
    expect(container.textContent?.trim().length).toBeGreaterThan(0);
    expect(mocks.replace).not.toHaveBeenCalled();
  });
});

describe('signed-in /profile', () => {
  it('redirects to the user profile and does not show the guest gate', () => {
    mocks.isLoggedIn = true;
    mocks.username = 'alice';

    renderPage();

    expect(screen.queryByRole('heading', { name: 'Sign in to view your profile' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Log in' })).toBeNull();
    expect(screen.getByRole('status').textContent).toContain('Opening your profile');
    expect(mocks.replace).toHaveBeenCalledWith('/@alice');
  });
});
