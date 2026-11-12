// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ChakraProvider } from '@chakra-ui/react';

vi.mock('next/dynamic', () => ({
  default: () => () => null,
}));

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
vi.mock('@/hooks/usePatronStatus', () => ({
  usePatronStatus: () => ({ getTier: () => null }),
}));
vi.mock('@/hooks/useCombflowPost', () => ({
  useCombflowPost: () => ({ data: null }),
}));
vi.mock('@/hooks/useCurrencyDisplay', () => ({
  useCurrencyDisplay: () => '$0.00',
}));
vi.mock('@/hooks/useVoteCalculator', () => ({
  useVoteCalculator: () => ({ calculateDelta: async () => 0 }),
}));
vi.mock('@/components/shared/Avatar', () => ({
  Avatar: () => <div data-testid="avatar" />,
}));
vi.mock('@/components/shared/MediaRenderer', () => ({ default: () => null }));
vi.mock('@/components/shared/OffscreenGate', () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('@/components/shared/HivePostPreview', () => ({ default: () => null }));
vi.mock('@/components/hangouts/HangoutPreviewCard', () => ({ default: () => null }));
vi.mock('@/components/shared/PileTray', () => ({ default: () => null }));
vi.mock('@/components/shared/PatronBadge', () => ({ default: () => null }));
vi.mock('@/components/shared/WaveBadge', () => ({ default: () => null }));
vi.mock('@/components/shared/TrendingBadge', () => ({ default: () => null }));
vi.mock('@/components/shared/SnapieCommunityBadge', () => ({ default: () => null }));
vi.mock('@/components/shared/VaultBadge', () => ({ default: () => null }));
vi.mock('@/components/shared/MoodBadgeIcon', () => ({ MoodBadgeIcon: () => null }));
vi.mock('@/lib/hive/client-functions', () => ({
  vote: vi.fn(),
  commentWithKeychain: vi.fn(),
}));
vi.mock('@/lib/points/client', () => ({ awardPoints: vi.fn() }));
vi.mock('@/lib/utils/translationCache', () => ({
  translationCache: { get: () => null, set: () => undefined },
}));
vi.mock('@/lib/utils/detectLanguage', () => ({
  detectLang: () => ({ lang: 'en', confident: true }),
}));
vi.mock('@snapie/content-filter', () => ({
  suggestRules: () => [],
}));

import Snap from './Snap';

const comment = {
  author: 'snapie',
  permlink: 'hello',
  body: 'hello world',
  created: '2024-01-01T00:00:00',
  children: 2,
  active_votes: [],
  net_rshares: 0,
  pending_payout_value: '0.000 HBD',
  total_payout_value: '0.000 HBD',
  parent_author: '',
  parent_permlink: 'blog',
  json_metadata: '{}',
} as any;

describe('Snap action buttons', () => {
  it('gives each snap-action control an accessible name', () => {
    render(
      <ChakraProvider>
        <Snap
          comment={comment}
          onOpen={vi.fn()}
          setReply={vi.fn()}
          setConversation={vi.fn()}
        />
      </ChakraProvider>,
    );

    for (const name of [
      'Vote',
      'Reply',
      'Open conversation',
      'Open as Snap-Cast (live)',
      'Re-Snap/Share',
      'Share on X',
    ]) {
      expect(screen.getByRole('button', { name })).toBeTruthy();
    }
  });
});
