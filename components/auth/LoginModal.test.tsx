// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { ChakraProvider } from '@chakra-ui/react';
import LoginModal from './LoginModal';

// Regression test for issue #143 (LoginModal exhaustive-deps): handleEmailSubmit
// reads `loading` for its in-flight guard but used to omit it from the
// useCallback deps — so a second click after the re-render (button still
// enabled because isDisabled didn't include `loading` either) invoked the
// stale closure and fired a duplicate registerWithEmail/loginWithEmail call.

const mocks = vi.hoisted(() => ({
  loginWithEmail: vi.fn(),
  registerWithEmail: vi.fn(),
  loginWithGoogle: vi.fn(),
  resendVerification: vi.fn(),
}));

vi.mock('@/lib/snapie-auth/client', () => ({
  loginWithEmail: mocks.loginWithEmail,
  registerWithEmail: mocks.registerWithEmail,
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

function renderModal() {
  return render(
    <ChakraProvider>
      <LoginModal
        displayed
        onSnapieLoginSuccess={vi.fn()}
        onAiohaLogin={vi.fn()}
        onClose={vi.fn()}
      />
    </ChakraProvider>,
  );
}

beforeEach(() => {
  mocks.loginWithEmail.mockReset();
  mocks.registerWithEmail.mockReset();
  mocks.loginWithGoogle.mockReset();
  mocks.resendVerification.mockReset();
});

afterEach(cleanup);

describe('LoginModal double-submit guard', () => {
  it('fires exactly one auth call when the submit button is clicked twice in a row', async () => {
    let resolveRegister!: (v?: unknown) => void;
    mocks.registerWithEmail.mockImplementation(
      () => new Promise(resolve => { resolveRegister = resolve; }),
    );

    renderModal();

    fireEvent.change(screen.getByPlaceholderText('you@example.com'), {
      target: { value: 'tester@example.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('••••••••'), {
      target: { value: 'hunter2' },
    });

    const submit = screen.getByRole('button', { name: 'Create Account' });
    fireEvent.click(submit);
    fireEvent.click(submit);

    // The first click starts the request; by the second click the re-render
    // has landed, so the fresh closure sees loading=true and bails (and the
    // button is disabled outright now that isDisabled includes loading).
    expect(mocks.registerWithEmail).toHaveBeenCalledTimes(1);
    expect(mocks.loginWithEmail).not.toHaveBeenCalled();

    // The one call that did go out still completes the normal flow.
    resolveRegister();
    await waitFor(() => expect(screen.getByText('Check your email')).toBeTruthy());
    expect(mocks.registerWithEmail).toHaveBeenCalledTimes(1);
  });

  it('still blocks an immediate second attempt after the request resolves (loading reset)', async () => {
    mocks.registerWithEmail.mockResolvedValue(undefined);
    renderModal();

    fireEvent.change(screen.getByPlaceholderText('you@example.com'), {
      target: { value: 'tester@example.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('••••••••'), {
      target: { value: 'hunter2' },
    });

    const submit = screen.getByRole('button', { name: 'Create Account' });
    fireEvent.click(submit);
    await waitFor(() => expect(screen.getByText('Check your email')).toBeTruthy());

    // View moved on to email-pending — the providers form is gone entirely.
    expect(screen.queryByRole('button', { name: 'Create Account' })).toBeNull();
  });
});
