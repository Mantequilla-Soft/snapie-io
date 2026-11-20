// @vitest-environment jsdom
process.env.TZ = 'America/Los_Angeles';

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { ChakraProvider } from '@chakra-ui/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PostSidebar, { formatDate } from './PostSidebar';

vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

vi.mock('@/hooks/useCurrentUser', () => ({
  useCurrentUser: () => ({ username: null }),
}));

vi.mock('@/hooks/useMoodBadges', () => ({
  useMoodBadges: () => ({ getEquippedBadge: () => null }),
}));

vi.mock('@/components/shared/Avatar', () => ({
  Avatar: () => <div data-testid="avatar" />,
}));

vi.mock('@/components/shared/MoodBadgeIcon', () => ({
  MoodBadgeIcon: () => null,
}));

vi.mock('@/components/shared/ProxiedImage', () => ({
  default: () => null,
}));

vi.mock('@/components/profile/UserActionButtons', () => ({
  default: () => null,
}));

vi.mock('@/components/profile/CurationQualityCard', () => ({
  default: () => null,
}));

const getProfile = vi.fn();
const getAccountPosts = vi.fn();
const getSimilarPosts = vi.fn();

vi.mock('@/lib/hive/client-functions', () => ({
  getProfile: (...args: unknown[]) => getProfile(...args),
  getAccountPosts: (...args: unknown[]) => getAccountPosts(...args),
  getSimilarPosts: (...args: unknown[]) => getSimilarPosts(...args),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('formatDate (Hive UTC without Z)', () => {
  it('shows the Pacific calendar day for an evening PT post', () => {
    expect(formatDate('2026-11-15T01:48:00')).toBe('Nov 14, 2026');
  });

  it('keeps explicit Z and offset strings', () => {
    expect(formatDate('2026-11-15T01:48:00Z')).toBe('Nov 14, 2026');
    expect(formatDate('2026-11-14T17:48:00-08:00')).toBe('Nov 14, 2026');
  });
});

describe('PostSidebar', () => {
  it('renders More from this author with the correct local date', async () => {
    getProfile.mockResolvedValue({
      metadata: { profile: { name: 'Author' } },
      stats: { followers: 1, following: 1 },
      created: '2016-01-01T00:00:00',
      post_count: 10,
      reputation: 50,
    });
    getAccountPosts.mockResolvedValue([
      {
        author: 'alice',
        permlink: 'evening-post',
        title: 'Evening Post Title',
        created: '2026-11-15T01:48:00',
        json_metadata: '{}',
      },
    ]);
    getSimilarPosts.mockResolvedValue([]);

    render(
      <ChakraProvider>
        <PostSidebar author="alice" permlink="current-post" />
      </ChakraProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText('More from this author')).toBeTruthy();
    });
    expect(screen.getByText('Evening Post Title')).toBeTruthy();
    expect(screen.getByText('Nov 14, 2026')).toBeTruthy();
  });
});
