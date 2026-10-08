// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ChakraProvider } from '@chakra-ui/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import FeedbackModal from './FeedbackModal';

const mocks = vi.hoisted(() => ({
  submitFeedback: vi.fn(),
  readChatSessionToken: vi.fn(() => 'chat-jwt'),
  username: null as string | null,
  isLoggedIn: false,
}));

vi.mock('@/lib/feedback/client', () => ({
  submitFeedback: mocks.submitFeedback,
  readChatSessionToken: mocks.readChatSessionToken,
}));

vi.mock('@/hooks/useCurrentUser', () => ({
  useCurrentUser: () => ({
    username: mocks.username,
    isLoggedIn: mocks.isLoggedIn,
    isSnapie: false,
    logout: () => {},
  }),
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

function renderModal() {
  return render(
    <ChakraProvider>
      <FeedbackModal isOpen onClose={vi.fn()} />
    </ChakraProvider>,
  );
}

beforeEach(() => {
  mocks.submitFeedback.mockReset();
  mocks.readChatSessionToken.mockReset();
  mocks.readChatSessionToken.mockReturnValue('chat-jwt');
  mocks.username = null;
  mocks.isLoggedIn = false;
});

afterEach(() => {
  cleanup();
});

describe('FeedbackModal', () => {
  it('asks for a title and message before sending', () => {
    renderModal();
    fireEvent.click(screen.getByRole('button', { name: 'Send feedback' }));
    expect(screen.getByText('Add a short title and a message.')).toBeTruthy();
    expect(mocks.submitFeedback).not.toHaveBeenCalled();
  });

  it('shows the created issue link', async () => {
    mocks.submitFeedback.mockResolvedValue({
      ok: true,
      url: 'https://github.com/Mantequilla-Soft/snapie-io/issues/7',
    });
    renderModal();
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Hello' } });
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'A note' } });
    fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'bug' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send feedback' }));

    expect(await screen.findByText('Thanks — we got it.')).toBeTruthy();
    const link = screen.getByRole('link', { name: 'View the GitHub issue' });
    expect(link.getAttribute('href')).toBe('https://github.com/Mantequilla-Soft/snapie-io/issues/7');
    expect(mocks.submitFeedback).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Hello',
      body: 'A note',
      category: 'bug',
      chatToken: 'chat-jwt',
    }));
  });

  it('shows the logged-in Hive username', () => {
    mocks.username = 'sable';
    mocks.isLoggedIn = true;
    renderModal();
    expect(screen.getByText(/Signed in as @sable/)).toBeTruthy();
  });

  it('shows a friendly error from the server', async () => {
    mocks.submitFeedback.mockResolvedValue({
      ok: false,
      error: "Feedback isn't available right now.",
    });
    renderModal();
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Hello' } });
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'A note' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send feedback' }));
    expect(await screen.findByText("Feedback isn't available right now.")).toBeTruthy();
    await waitFor(() => {
      expect(mocks.submitFeedback).toHaveBeenCalled();
    });
  });
});
