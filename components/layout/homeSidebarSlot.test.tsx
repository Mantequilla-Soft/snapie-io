// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, waitFor, act } from '@testing-library/react';
import { ChakraProvider } from '@chakra-ui/react';
import { createElement } from 'react';
import HomeRightSidebarSlot from './HomeRightSidebarSlot';
import DeferredRightSidebar from './DeferredRightSidebar';
import RightSideBar from './RightSideBar';
import { HOME_RIGHT_SIDEBAR_WIDTH } from '@/lib/layout/homeSidebarSlot';
import { afterLcpPaint } from '@/lib/perf/afterLcpPaint';

vi.mock('@/lib/perf/afterLcpPaint', () => ({
  afterLcpPaint: vi.fn(() => new Promise<void>(() => undefined)),
}));

vi.mock('@/contexts/UserContext', () => ({
  useHiveUser: () => ({ hiveUser: null }),
}));

vi.mock('@/hooks/useCurrentUser', () => ({
  useCurrentUser: () => ({ username: null, isLoggedIn: false, isSnapie: false, logout: () => undefined }),
}));

vi.mock('@/lib/hive/client-functions', () => ({
  findPosts: vi.fn(async () => []),
  getCommunityInfo: vi.fn(async () => null),
}));

vi.mock('@/lib/hive/muted-accounts', () => ({
  mutedAccountsManager: {
    getMutedList: vi.fn(async () => new Set<string>()),
  },
}));

vi.mock('@/components/blog/PostInfiniteScroll', () => ({ default: () => null }));
vi.mock('@/components/hangouts/SidebarEventsWidget', () => ({ default: () => null }));
vi.mock('@/components/layout/TrendingMarketsWidget', () => ({ default: () => null }));
vi.mock('@/components/layout/ContainerVoteWidget', () => ({ default: () => null }));
vi.mock('@/components/layout/WhoToFollowWidget', () => ({ default: () => null }));

function widthsFor(el: HTMLElement): string[] {
  const css = Array.from(document.querySelectorAll('style'))
    .map((node) => node.textContent ?? '')
    .join('\n');
  const found: string[] = [];
  for (const cls of el.className.split(/\s+/).filter(Boolean)) {
    const pattern = new RegExp(`\\.${cls}(?![\\w-])[^{]*\\{([^}]*)\\}`, 'g');
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(css))) {
      const width = match[1].match(/(?:^|[^-])width:\s*([^;]+)/);
      if (width) found.push(width[1].trim());
    }
  }
  return found;
}

function renderInChakra(node: ReturnType<typeof createElement>) {
  return render(createElement(ChakraProvider, null, node));
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('home right sidebar slot', () => {
  it('reserves 300px on the placeholder and on the loaded column', () => {
    expect(HOME_RIGHT_SIDEBAR_WIDTH).toBe('300px');
    const slotView = renderInChakra(createElement(HomeRightSidebarSlot));
    const slot = slotView.container.querySelector('[data-home-sidebar-slot]') as HTMLElement;
    expect(slot).not.toBeNull();
    expect(slot.getAttribute('data-sidebar-width')).toBe('300px');
    expect(slot.tagName).toBe('ASIDE');
    const slotWidths = widthsFor(slot);
    expect(slotWidths).toContain('300px');
    expect(slotWidths).toContain('100%');
    slotView.unmount();

    const loadedView = renderInChakra(createElement(RightSideBar, { engagedAuthors: new Set<string>() }));
    const frame = loadedView.container.querySelector('[data-home-sidebar-frame]') as HTMLElement;
    expect(frame).not.toBeNull();
    expect(frame.getAttribute('data-sidebar-width')).toBe('300px');
    expect(frame.tagName).toBe('ASIDE');
    expect(widthsFor(frame)).toEqual(expect.arrayContaining(['300px', '100%']));
  });

  it('keeps the 300px slot mounted until the priority image has painted', async () => {
    vi.mocked(afterLcpPaint).mockReturnValue(new Promise<void>(() => undefined));
    const { container } = renderInChakra(createElement(DeferredRightSidebar, { engagedAuthors: new Set<string>() }));
    const slot = container.querySelector('[data-home-sidebar-slot]') as HTMLElement;
    expect(slot).not.toBeNull();
    expect(slot.getAttribute('data-sidebar-width')).toBe('300px');
    expect(widthsFor(slot)).toContain('300px');
    expect(container.querySelector('[data-home-sidebar-frame]')).toBeNull();
    await act(async () => {
      await Promise.resolve();
    });
    expect(container.querySelector('[data-home-sidebar-frame]')).toBeNull();
  });

  it('mounts the sidebar only after the priority image paints', async () => {
    let release = () => undefined as void;
    vi.mocked(afterLcpPaint).mockReturnValue(new Promise<void>((resolve) => {
      release = resolve;
    }));
    const { container } = renderInChakra(createElement(DeferredRightSidebar, { engagedAuthors: new Set<string>() }));
    expect(container.querySelector('[data-home-sidebar-slot]')).not.toBeNull();
    expect(container.querySelector('[data-home-sidebar-frame]')).toBeNull();
    await act(async () => {
      release();
    });
    await waitFor(() => {
      expect(container.querySelector('[data-home-sidebar-frame]')).not.toBeNull();
    });
    const frame = container.querySelector('[data-home-sidebar-frame]') as HTMLElement;
    expect(container.querySelector('[data-home-sidebar-slot]')).toBeNull();
    expect(frame.getAttribute('data-sidebar-width')).toBe('300px');
    expect(widthsFor(frame)).toContain('300px');
  });
});
