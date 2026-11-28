// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { ChakraProvider } from '@chakra-ui/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ShortItem } from '@/lib/shorts/types';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('@/hooks/useCurrentUser', () => ({
  useCurrentUser: () => ({ username: null, isLoggedIn: false }),
}));

vi.mock('@/hooks/useMoodBadges', () => ({
  useMoodBadges: () => ({ getEquippedBadge: () => null }),
}));

vi.mock('@/hooks/useUserRelationship', () => ({
  useUserRelationship: () => ({ isFollowing: false, isMuted: false, follow: vi.fn(), unfollow: vi.fn(), mute: vi.fn() }),
}));

vi.mock('@/hooks/useRememberedVoteWeight', () => ({
  useRememberedVoteWeight: () => ({ weight: 100, setWeight: vi.fn(), rememberWeight: vi.fn() }),
}));

vi.mock('@mantequilla-soft/3speak-player/react', () => ({
  usePlayer: () => ({ containerRef: { current: null }, isReady: false }),
}));

vi.mock('@/components/shared/ProxiedImage', () => ({
  default: () => null,
}));

vi.mock('@/components/shared/Avatar', () => ({
  Avatar: () => <div data-testid="avatar" />,
}));

vi.mock('@/lib/hive/client-functions', () => ({
  vote: vi.fn(),
  getPost: vi.fn(),
}));

vi.mock('@/lib/points/client', () => ({
  awardPoints: vi.fn(),
}));

vi.mock('@/lib/chat/ChatService', () => ({
  chatService: { getConversations: vi.fn(async () => []) },
}));

vi.mock('@/components/shared/VotersModal', () => ({ default: () => null }));

const short: ShortItem = {
  id: 'alice-p-1',
  author: 'alice',
  hivePermlink: 'hive-p',
  permlink: 'p',
  thumbnailUrl: '',
  title: 'Hello short',
  views: 0,
  timeAgo: '1h',
  stats: { likes: 0, comments: 0, payout: '0.000 HBD' },
};

afterEach(cleanup);

describe('ShortCard safe-area chrome (#258)', () => {
  it('keeps caption and action rail clear of the home indicator and notch', async () => {
    const { default: ShortCard } = await import('./ShortCard');
    render(
      <ChakraProvider>
        <ShortCard
          short={short}
          isActive={false}
          isPreload={false}
          muted
          onToggleMute={() => {}}
          onOpenComments={() => {}}
        />
      </ChakraProvider>,
    );

    expect(screen.getByText('@alice')).toBeTruthy();
    const css = [...document.querySelectorAll('style')].map((node) => node.textContent || '').join('\n');
    expect(css).toContain('env(safe-area-inset-bottom)');
    expect(css).toContain('env(safe-area-inset-left)');
    expect(css).toContain('env(safe-area-inset-right)');
    expect(css).toMatch(/max\([^)]*safe-area-inset-bottom/);
    expect(css).toMatch(/max\([^)]*safe-area-inset-left/);
    expect(css).toMatch(/max\([^)]*safe-area-inset-right/);
  });
});
