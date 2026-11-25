// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
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
  useCurrentUser: () => ({ username: 'voter' }),
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
// Renders the optimistic delta so the test can see whether it survives.
vi.mock('@/hooks/useCurrencyDisplay', () => ({
  useCurrencyDisplay: (_post: unknown, delta = 0) => `delta:${delta}`,
}));
vi.mock('@/hooks/useVoteCalculator', () => ({
  useVoteCalculator: () => ({ calculateDelta: async () => 0.03 }),
}));
// A bare stand-in for the slider: one click runs the same optimistic-then-
// broadcast sequence VoteSlider.tsx runs for a new vote.
vi.mock('./VoteSlider', () => ({
  default: ({ onVote, onVoteOptimistic }: {
    onVote: (w: number) => Promise<unknown>;
    onVoteOptimistic?: (w: number) => void;
  }) => (
    <button
      type="button"
      onClick={async () => {
        onVoteOptimistic?.(100);
        await onVote(100);
      }}
    >
      Cast vote
    </button>
  ),
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
import { vote } from '@/lib/hive/client-functions';

const baseComment = {
  author: 'snapie',
  permlink: 'reply-1',
  body: 'a reply',
  created: '2024-01-01T00:00:00',
  children: 0,
  active_votes: [],
  net_rshares: 0,
  pending_payout_value: '0.000 HBD',
  total_payout_value: '0.000 HBD',
  parent_author: 'op',
  parent_permlink: 'post',
  json_metadata: '{}',
} as any;

function renderSnap(props: Partial<React.ComponentProps<typeof Snap>> = {}) {
  const ui = (p: Partial<React.ComponentProps<typeof Snap>>) => (
    <ChakraProvider>
      <Snap comment={baseComment} onOpen={vi.fn()} setReply={vi.fn()} {...p} />
    </ChakraProvider>
  );
  const view = render(ui(props));
  return { ...view, rerenderWith: (p: Partial<React.ComponentProps<typeof Snap>>) => view.rerender(ui(p)) };
}

async function castVote() {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Cast vote' }));
  });
}

describe('Snap optimistic vote value (#374)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(vote).mockResolvedValue({ success: true } as any);
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('keeps the voted value when there is no refreshComment (post-page replies)', async () => {
    renderSnap();
    await castVote();
    expect(screen.getByText('delta:0.03')).toBeTruthy();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    // Nothing fetched fresh data, so dropping the delta would show the
    // pre-vote payout (zero) — the bug in #374.
    expect(screen.getByText('delta:0.03')).toBeTruthy();
  });

  it('drops the delta once refreshComment has landed the real value', async () => {
    const refreshComment = vi.fn().mockResolvedValue(undefined);
    renderSnap({ refreshComment });
    await castVote();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });

    expect(refreshComment).toHaveBeenCalledWith('snapie', 'reply-1');
    expect(screen.getByText('delta:0')).toBeTruthy();
  });

  it('drops the delta when a refetched comment already carries the vote', async () => {
    const { rerenderWith } = renderSnap();
    await castVote();
    expect(screen.getByText('delta:0.03')).toBeTruthy();

    rerenderWith({
      comment: { ...baseComment, active_votes: [{ voter: 'voter', rshares: 1, percent: 10000 }] },
    });

    // The fresh payout already includes this vote, so the delta must not stack.
    expect(screen.getByText('delta:0')).toBeTruthy();
  });

  it('keeps the delta when a refetch has not picked up the vote yet', async () => {
    const { rerenderWith } = renderSnap();
    await castVote();

    rerenderWith({
      comment: {
        ...baseComment,
        active_votes: [{ voter: 'someone-else', rshares: 1, percent: 10000 }],
      },
    });

    expect(screen.getByText('delta:0.03')).toBeTruthy();
  });
});
