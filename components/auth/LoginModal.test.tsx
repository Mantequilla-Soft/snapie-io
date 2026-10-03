// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { ChakraProvider } from '@chakra-ui/react';
import LoginModal from './LoginModal';
import { SnapieAuthError } from '@/lib/snapie-auth/types';

// The email form's mode is auto-detected inside authenticateWithEmail
// (lib/snapie-auth/client.ts), whose fallback rules have their own unit tests in
// lib/snapie-auth/client.test.ts. Here we only assert the UI wiring: that the
// modal forwards the chosen mode, renders notices, and reacts to errors.
//
// Also still covering the original regression test for issue #143
// (LoginModal exhaustive-deps): handleEmailSubmit reads `loading` for its
// in-flight guard but used to omit it from the useCallback deps — so a second
// click after the re-render (button still enabled because isDisabled didn't
// include `loading` either) invoked the stale closure and fired a duplicate call.

const mocks = vi.hoisted(() => ({
  authenticateWithEmail: vi.fn(),
  loginWithGoogle: vi.fn(),
  resendVerification: vi.fn(),
}));

vi.mock('@/lib/snapie-auth/client', () => ({
  authenticateWithEmail: mocks.authenticateWithEmail,
  loginWithGoogle: mocks.loginWithGoogle,
  resendVerification: mocks.resendVerification,
}));

vi.mock('./GoogleLoginButton', () => ({ default: () => null }));
vi.mock('./AccountSetupPanel', () => ({ default: () => null }));
vi.mock('@aioha/react-ui', () => ({ AiohaModal: () => null }));
vi.mock('@aioha/aioha', () => ({ Providers: {} }));

// Chakra components probe matchMedia; jsdom doesn't ship it.
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

const HIVE_USER = {
  id: 'u1',
  name: 'tester',
  picture: null,
  hiveUsername: 'tester',
  custodyMode: 'custodial',
  isAdmin: false,
} as never;

function renderModal(onSnapieLoginSuccess: (u: unknown) => void = vi.fn()) {
  return render(
    <ChakraProvider>
      <LoginModal
        displayed
        onSnapieLoginSuccess={onSnapieLoginSuccess}
        onAiohaLogin={vi.fn()}
        onClose={vi.fn()}
      />
    </ChakraProvider>,
  );
}

function fillCredentials() {
  fireEvent.change(screen.getByPlaceholderText('you@example.com'), {
    target: { value: 'tester@example.com' },
  });
  fireEvent.change(screen.getByPlaceholderText('••••••••'), {
    target: { value: 'hunter2' },
  });
}

beforeEach(() => {
  mocks.authenticateWithEmail.mockReset();
  mocks.loginWithGoogle.mockReset();
  mocks.resendVerification.mockReset();
});

afterEach(cleanup);

describe('LoginModal double-submit guard', () => {
  it('fires exactly one auth call when the submit button is clicked twice in a row', async () => {
    let resolveAuth!: (v?: unknown) => void;
    mocks.authenticateWithEmail.mockImplementation(
      () => new Promise(resolve => { resolveAuth = resolve; }),
    );

    renderModal();
    fillCredentials();

    const submit = screen.getByRole('button', { name: 'Create Account' });
    fireEvent.click(submit);
    fireEvent.click(submit);

    // The first click starts the request; by the second click the re-render
    // has landed, so the fresh closure sees loading=true and bails (and the
    // button is disabled outright now that isDisabled includes loading).
    expect(mocks.authenticateWithEmail).toHaveBeenCalledTimes(1);

    // The one call that did go out still completes the normal flow.
    resolveAuth({ outcome: 'registered' });
    await waitFor(() => expect(screen.getByText('Check your email')).toBeTruthy());
    expect(mocks.authenticateWithEmail).toHaveBeenCalledTimes(1);
  });

  it('still blocks an immediate second attempt after the request resolves (loading reset)', async () => {
    mocks.authenticateWithEmail.mockResolvedValue({ outcome: 'registered' });
    renderModal();
    fillCredentials();

    const submit = screen.getByRole('button', { name: 'Create Account' });
    fireEvent.click(submit);
    await waitFor(() => expect(screen.getByText('Check your email')).toBeTruthy());

    // View moved on to email-pending — the providers form is gone entirely.
    expect(screen.queryByRole('button', { name: 'Create Account' })).toBeNull();
  });
});

describe('LoginModal email mode auto-detection', () => {
  it('forwards the chosen tab as a hint to authenticateWithEmail', async () => {
    mocks.authenticateWithEmail.mockResolvedValue({ outcome: 'registered' });
    renderModal();
    fillCredentials();
    fireEvent.click(screen.getByRole('button', { name: 'Create Account' }));

    await waitFor(() =>
      expect(mocks.authenticateWithEmail).toHaveBeenCalledWith(
        'tester@example.com',
        'hunter2',
        'register',
      ),
    );
  });

  it('signs the user in and explains itself when the account already existed', async () => {
    const onSuccess = vi.fn();
    mocks.authenticateWithEmail.mockResolvedValue({
      outcome: 'signedIn',
      user: HIVE_USER,
      notice: 'alreadyRegistered',
    });

    renderModal(onSuccess);
    fillCredentials();
    fireEvent.click(screen.getByRole('button', { name: 'Create Account' }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith(HIVE_USER));
    await waitFor(() =>
      expect(
        screen.getByText('That email is already registered — signing you in instead.'),
      ).toBeTruthy(),
    );
    // Tab flips to Sign In so a retry starts from the right mode.
    expect(screen.getByRole('button', { name: 'Sign In' })).toBeTruthy();
  });

  it('creates the account and explains itself when no account was found', async () => {
    const onSuccess = vi.fn();
    mocks.authenticateWithEmail.mockResolvedValue({
      outcome: 'registered',
      notice: 'accountCreated',
    });

    renderModal(onSuccess);
    fillCredentials();
    fireEvent.click(screen.getByRole('tab', { name: 'Sign In' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sign In' }));

    await waitFor(() => expect(screen.getByText('Check your email')).toBeTruthy());
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('surfaces an invalid-credentials error without entering a signup flow', async () => {
    const onSuccess = vi.fn();
    mocks.authenticateWithEmail.mockRejectedValue(
      new SnapieAuthError('unauthorized', 401, undefined, true),
    );

    renderModal(onSuccess);
    fillCredentials();
    fireEvent.click(screen.getByRole('button', { name: 'Create Account' }));

    await waitFor(() => expect(screen.getByText('Invalid email or password.')).toBeTruthy());
    expect(screen.queryByText('Check your email')).toBeNull();
    expect(onSuccess).not.toHaveBeenCalled();
    // accountExists tells the UI the correct mode for the next attempt.
    expect(screen.getByRole('button', { name: 'Sign In' })).toBeTruthy();
  });

  it('surfaces email_not_verified without any fallback wording', async () => {
    mocks.authenticateWithEmail.mockRejectedValue(
      new SnapieAuthError('email_not_verified', 403),
    );

    renderModal();
    fillCredentials();
    fireEvent.click(screen.getByRole('button', { name: 'Create Account' }));

    await waitFor(() =>
      expect(screen.getByText(/Please verify your email before signing in/)).toBeTruthy(),
    );
  });

  it('clears a stale notice as soon as the user types again', async () => {
    mocks.authenticateWithEmail.mockResolvedValue({
      outcome: 'signedIn',
      user: HIVE_USER,
      notice: 'alreadyRegistered',
    });

    const onSuccess = vi.fn();
    renderModal(onSuccess);
    fillCredentials();
    fireEvent.click(screen.getByRole('button', { name: 'Create Account' }));

    await waitFor(() =>
      expect(
        screen.getByText('That email is already registered — signing you in instead.'),
      ).toBeTruthy(),
    );
    fireEvent.change(screen.getByPlaceholderText('••••••••'), {
      target: { value: 'hunter3' },
    });
    expect(
      screen.queryByText('That email is already registered — signing you in instead.'),
    ).toBeNull();
  });
});
