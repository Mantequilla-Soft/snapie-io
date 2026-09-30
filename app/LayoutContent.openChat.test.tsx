// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';
import { ChakraProvider } from '@chakra-ui/react';
import LayoutContent from './LayoutContent';
import { OPEN_CHAT_EVENT } from '@/lib/chat/openChat';

// The guest gate lives on the /chat page. This checks the shell still shows
// that page, and that a signed-in visit (which dispatches OPEN_CHAT_EVENT)
// opens the existing panel instead of leaving the main column as the only UI.

vi.mock('next/navigation', () => ({
  usePathname: () => '/chat',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/components/layout/Sidebar', () => ({ default: () => <nav>Site nav</nav> }));
vi.mock('@/components/layout/MobileHeader', () => ({ default: () => null }));
vi.mock('@/components/layout/BottomTabBar', () => ({ default: () => null }));
vi.mock('@/components/layout/MeSheet', () => ({ default: () => null }));
vi.mock('@/components/chat/ChatPanel', () => ({
  default: ({ isOpen }: { isOpen: boolean }) => (isOpen ? <div>Chat panel</div> : null),
}));
vi.mock('@/components/hangouts/HangoutModal', () => ({ default: () => null }));
vi.mock('@/components/auth/EmancipationBanner', () => ({ default: () => null }));
vi.mock('@/components/auth/NeedsWalletHandler', () => ({ default: () => null }));
vi.mock('@/components/onboarding/InterestPicker', () => ({ default: () => null }));
vi.mock('@/components/whatsnew/WhatsNewModal', () => ({ default: () => null }));
vi.mock('@/components/points/PointsToaster', () => ({ default: () => null }));
vi.mock('@/components/debug/DebugConsole', () => ({ default: () => null }));

vi.mock('@/lib/chat/ChatService', () => ({
  chatService: { getUnreadCount: vi.fn(async () => 0) },
}));

vi.mock('@/contexts/HangoutContext', () => ({
  useHangout: () => ({ activeRoom: null, closeRoom: vi.fn() }),
}));

vi.mock('@/hooks/useUserSettings', () => ({
  useUserSettings: () => ({ settings: { colorMode: 'dark' } }),
}));

vi.mock('@/hooks/useCurrentUser', () => ({
  useCurrentUser: () => ({ username: null }),
}));

vi.mock('@/hooks/useShowInterestPicker', () => ({
  useShowInterestPicker: () => ({ shouldShow: false, dismiss: vi.fn() }),
}));

vi.mock('@/lib/points/config', () => ({
  isPointsEnabledFor: () => false,
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

afterEach(cleanup);

describe('chat shell', () => {
  it('keeps the page content visible for a guest and opens the panel only when asked', () => {
    render(
      <ChakraProvider>
        <LayoutContent>
          <h1>Sign in to chat</h1>
        </LayoutContent>
      </ChakraProvider>,
    );

    expect(screen.getByText('Site nav')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Sign in to chat' })).toBeTruthy();
    expect(screen.queryByText('Chat panel')).toBeNull();

    act(() => {
      window.dispatchEvent(new CustomEvent(OPEN_CHAT_EVENT));
    });

    expect(screen.getByText('Chat panel')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Sign in to chat' })).toBeTruthy();
  });
});
