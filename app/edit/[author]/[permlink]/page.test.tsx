// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { ChakraProvider } from '@chakra-ui/react';
import type { ReactNode } from 'react';
import EditPostPage from './page';

// Guests used to skip the author guard (username falsy), so /edit filled the
// editor with someone else's post from getPost. The page now gates guests
// like /chat and /profile, and only loads the post for the author.

const mocks = vi.hoisted(() => ({
  isLoggedIn: false,
  username: null as string | null,
  isLoading: false,
  openLoginModal: vi.fn(),
  replace: vi.fn(),
  push: vi.fn(),
  getPost: vi.fn(),
  params: { author: 'alice', permlink: 'hello-world' },
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
  useParams: () => mocks.params,
  useRouter: () => ({ replace: mocks.replace, push: mocks.push }),
}));

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children?: ReactNode }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

vi.mock('next/dynamic', () => ({
  default: () =>
    function MockEditor({ title, markdown }: { title: string; markdown: string }) {
      return (
        <div data-testid="blog-editor">
          <span data-testid="editor-title">{title}</span>
          <span data-testid="editor-body">{markdown}</span>
        </div>
      );
    },
}));

vi.mock('@/lib/hive/client-functions', () => ({
  getPost: (...args: unknown[]) => mocks.getPost(...args),
  commentWithKeychain: vi.fn(),
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
      <EditPostPage />
    </ChakraProvider>,
  );
}

beforeEach(() => {
  mocks.isLoggedIn = false;
  mocks.username = null;
  mocks.isLoading = false;
  mocks.params = { author: 'alice', permlink: 'hello-world' };
  mocks.openLoginModal.mockReset();
  mocks.replace.mockReset();
  mocks.push.mockReset();
  mocks.getPost.mockReset();
  mocks.getPost.mockResolvedValue({
    author: 'alice',
    title: 'Secret draft title',
    body: 'Secret draft body that guests must not see',
    parent_author: '',
    parent_permlink: 'blog',
    json_metadata: '{"tags":["snapie"]}',
  });
});

afterEach(cleanup);

describe('guest /edit', () => {
  it('shows a sign-in gate and does not load or show the post in the editor', () => {
    renderPage();

    expect(screen.getByRole('heading', { name: 'Sign in to edit' })).toBeTruthy();
    expect(screen.getByText(/Google, email, or your Hive wallet/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Log in' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Create account' }).getAttribute('href')).toBe('/join');
    expect(screen.queryByTestId('blog-editor')).toBeNull();
    expect(screen.queryByText('Secret draft body that guests must not see')).toBeNull();
    expect(mocks.getPost).not.toHaveBeenCalled();
  });

  it('holds the gate while the session check is in flight', () => {
    mocks.isLoading = true;
    renderPage();

    expect(screen.getByRole('status').textContent).toMatch(/Checking session/);
    expect(screen.queryByRole('heading', { name: 'Sign in to edit' })).toBeNull();
    expect(screen.queryByTestId('blog-editor')).toBeNull();
    expect(mocks.getPost).not.toHaveBeenCalled();
  });
});

describe('signed-in author /edit', () => {
  it('loads the post and shows the editor for the author', async () => {
    mocks.isLoggedIn = true;
    mocks.username = 'alice';

    renderPage();

    await waitFor(() => {
      expect(mocks.getPost).toHaveBeenCalledWith('alice', 'hello-world');
    });
    await waitFor(() => {
      expect(screen.getByTestId('blog-editor')).toBeTruthy();
    });
    expect(screen.getByTestId('editor-title').textContent).toBe('Secret draft title');
    expect(screen.getByTestId('editor-body').textContent).toBe(
      'Secret draft body that guests must not see',
    );
    expect(screen.queryByRole('heading', { name: 'Sign in to edit' })).toBeNull();
    expect(mocks.replace).not.toHaveBeenCalled();
  });
});

describe('signed-in non-author /edit', () => {
  it('redirects without showing the editor or post body', async () => {
    mocks.isLoggedIn = true;
    mocks.username = 'bob';

    renderPage();

    await waitFor(() => {
      expect(mocks.replace).toHaveBeenCalledWith('/@alice/hello-world');
    });
    expect(screen.queryByTestId('blog-editor')).toBeNull();
    expect(screen.queryByText('Secret draft body that guests must not see')).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Sign in to edit' })).toBeNull();
    expect(mocks.getPost).not.toHaveBeenCalled();
  });
});
