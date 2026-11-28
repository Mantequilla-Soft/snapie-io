// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { ChakraProvider } from '@chakra-ui/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import MeSheet from './MeSheet';
import { windows95ThemeDark } from '@/themes/windows95';

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children?: React.ReactNode }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

vi.mock('@/hooks/useCurrentUser', () => ({
  useCurrentUser: () => ({ username: null, isLoggedIn: false, logout: vi.fn() }),
}));

vi.mock('@/contexts/LoginModalContext', () => ({
  useLoginModal: () => ({ openLoginModal: vi.fn() }),
}));

vi.mock('@/contexts/NotificationContext', () => ({
  useNotifications: () => ({ unreadCount: 0 }),
}));

vi.mock('@/hooks/useOpenPodsCount', () => ({
  useOpenPodsCount: () => 0,
}));

vi.mock('@/hooks/useMoodBadges', () => ({
  useMoodBadges: () => ({ getEquippedBadge: () => null }),
}));

vi.mock('@/components/feedback/FeedbackModal', () => ({ default: () => null }));
vi.mock('./HiveActivityWidget', () => ({ default: () => null }));

afterEach(cleanup);

describe('MeSheet safe-area (#258)', () => {
  it('applies horizontal safe-area padding and inherits Drawer bottom inset', () => {
    render(
      <ChakraProvider theme={windows95ThemeDark}>
        <MeSheet isOpen onClose={() => {}} onToggleChat={() => {}} chatUnreadCount={0} />
      </ChakraProvider>,
    );

    expect(screen.getByText('Welcome to Snapie')).toBeTruthy();
    const css = [...document.querySelectorAll('style')].map((node) => node.textContent || '').join('\n');
    expect(css).toContain('env(safe-area-inset-left)');
    expect(css).toContain('env(safe-area-inset-right)');
    expect(css).toContain('env(safe-area-inset-bottom)');
  });
});
