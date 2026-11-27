// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { ChakraProvider } from '@chakra-ui/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BackButton } from './ShortsPlayer';
import ShortsCommentSheet from './ShortsCommentSheet';
import { windows95ThemeDark } from '@/themes/windows95';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
  usePathname: () => '/shorts',
}));

vi.mock('@/hooks/useShorts', () => ({
  useShorts: () => ({ shorts: [], loading: false, error: null, hasMore: false, load: vi.fn(), prime: vi.fn(), removeAuthor: vi.fn() }),
}));

vi.mock('@/hooks/useCurrentUser', () => ({
  useCurrentUser: () => ({ username: null, isLoggedIn: false }),
}));

vi.mock('./ShortCard', () => ({ default: () => null }));
vi.mock('./ShortsCommentContent', () => ({ default: () => <div>comments</div> }));

afterEach(cleanup);

function emotionCss() {
  return [...document.querySelectorAll('style')].map((node) => node.textContent || '').join('\n');
}

describe('Shorts safe-area chrome (#258)', () => {
  it('pads the back button off the notch on the top and left', () => {
    render(
      <ChakraProvider>
        <BackButton onClick={() => {}} />
      </ChakraProvider>,
    );
    expect(screen.getByRole('button', { name: 'Back' })).toBeTruthy();
    const css = emotionCss();
    expect(css).toContain('safe-area-inset-top');
    expect(css).toContain('safe-area-inset-left');
    expect(css).toMatch(/max\([^)]*safe-area-inset-left/);
  });

  it('pads ShortsCommentSheet for landscape insets', () => {
    render(
      <ChakraProvider theme={windows95ThemeDark}>
        <ShortsCommentSheet
          isOpen
          onClose={() => {}}
          author="alice"
          permlink="p"
          commentCount={0}
        />
      </ChakraProvider>,
    );
    const css = emotionCss();
    expect(css).toContain('env(safe-area-inset-left)');
    expect(css).toContain('env(safe-area-inset-right)');
    expect(css).toContain('env(safe-area-inset-bottom)');
  });
});
