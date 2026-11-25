// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import DeferredRightSidebar from './DeferredRightSidebar';

let releasePaint: (() => void) | null = null;
vi.mock('@/lib/perf/afterLcpPaint', () => ({
  afterLcpPaint: () => new Promise<void>((resolve) => {
    releasePaint = resolve;
  }),
}));

vi.mock('@/components/layout/RightSideBar', () => ({
  default: () => <aside data-testid="right-sidebar">sidebar</aside>,
}));

function matchMedia(matches: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
}

beforeEach(() => {
  cleanup();
  releasePaint = null;
});

describe('DeferredRightSidebar', () => {
  it('reserves the desktop column until the sidebar chunk is allowed to load', async () => {
    matchMedia(true);
    render(<DeferredRightSidebar engagedAuthors={new Set()} />);
    expect(await screen.findByTestId('right-sidebar-slot')).toBeTruthy();
    expect(screen.queryByTestId('right-sidebar')).toBeNull();
    releasePaint?.();
    expect(await screen.findByTestId('right-sidebar')).toBeTruthy();
    expect(screen.queryByTestId('right-sidebar-slot')).toBeNull();
  });

  it('does not reserve a column on a phone', () => {
    matchMedia(false);
    render(<DeferredRightSidebar engagedAuthors={new Set()} />);
    expect(screen.queryByTestId('right-sidebar-slot')).toBeNull();
    expect(screen.queryByTestId('right-sidebar')).toBeNull();
  });
});
