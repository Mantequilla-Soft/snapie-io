// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ChakraProvider } from '@chakra-ui/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import FeedbackModal from './FeedbackModal';

const mocks = vi.hoisted(() => ({
  submitFeedback: vi.fn(),
  readChatSessionToken: vi.fn(() => 'chat-jwt'),
  uploadImageWithKeychain: vi.fn(),
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

vi.mock('@/lib/hive/client-functions', () => ({
  uploadImageWithKeychain: mocks.uploadImageWithKeychain,
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
  mocks.uploadImageWithKeychain.mockReset();
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

  it('hides the screenshot picker from a guest', () => {
    renderModal();
    expect(screen.queryByLabelText('Screenshot')).toBeNull();
    expect(screen.queryByText(/Screenshot \(optional\)/)).toBeNull();
  });

  it('shows the screenshot picker only when signed in', () => {
    mocks.username = 'sable';
    mocks.isLoggedIn = true;
    renderModal();
    expect(screen.getByLabelText('Screenshot')).toBeTruthy();
  });

  it('rejects a gif before uploading', () => {
    mocks.username = 'sable';
    mocks.isLoggedIn = true;
    renderModal();
    const file = new File(['gif'], 'shot.gif', { type: 'image/gif' });
    fireEvent.change(screen.getByLabelText('Screenshot'), { target: { files: [file] } });
    expect(screen.getByText('Screenshots must be a PNG, JPEG, or WebP image.')).toBeTruthy();
    expect(mocks.uploadImageWithKeychain).not.toHaveBeenCalled();
  });

  it('uploads a signed-in screenshot and sends the hosted URL', async () => {
    mocks.username = 'sable';
    mocks.isLoggedIn = true;
    mocks.uploadImageWithKeychain.mockResolvedValue('https://images.hive.blog/DQmabc/shot.png');
    mocks.submitFeedback.mockResolvedValue({
      ok: true,
      url: 'https://github.com/Mantequilla-Soft/snapie-io/issues/7',
    });
    renderModal();
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Broken layout' } });
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'See the shot.' } });
    const file = new File(['png'], 'shot.png', { type: 'image/png' });
    fireEvent.change(screen.getByLabelText('Screenshot'), { target: { files: [file] } });
    fireEvent.click(screen.getByRole('button', { name: 'Send feedback' }));

    expect(await screen.findByText('Thanks — we got it.')).toBeTruthy();
    expect(mocks.uploadImageWithKeychain).toHaveBeenCalledTimes(1);
    expect(mocks.uploadImageWithKeychain.mock.calls[0][1]).toBe('sable');
    expect(mocks.submitFeedback).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Broken layout',
      body: 'See the shot.',
      screenshotUrl: 'https://images.hive.blog/DQmabc/shot.png',
    }));
  });
});
