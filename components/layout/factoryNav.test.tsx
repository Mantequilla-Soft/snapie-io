// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { ChakraProvider } from '@chakra-ui/react'
import { createElement } from 'react'
import Sidebar from './Sidebar'
import MeSheet from './MeSheet'

// The Butter Factory page has no other way in: these two menus are the only places it is linked.

let currentUser: { username: string | null; isLoggedIn: boolean } = { username: null, isLoggedIn: false }

vi.mock('next/navigation', () => ({ usePathname: () => '/', useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/hooks/useCurrentUser', () => ({
  useCurrentUser: () => ({ ...currentUser, logout: vi.fn() }),
}))
vi.mock('@/hooks/useIsAdmin', () => ({ useIsAdmin: () => ({ isAdmin: false }) }))
vi.mock('@/contexts/LoginModalContext', () => ({ useLoginModal: () => ({ openLoginModal: vi.fn() }) }))
vi.mock('@/contexts/NotificationContext', () => ({ useNotifications: () => ({ unreadCount: 0 }) }))
vi.mock('@/hooks/useOpenPodsCount', () => ({ useOpenPodsCount: () => 0 }))
vi.mock('@/hooks/useUnclaimedRewards', () => ({ useUnclaimedRewards: () => false }))
vi.mock('@/hooks/useMoodBadges', () => ({ useMoodBadges: () => ({ getEquippedBadge: () => null }) }))
vi.mock('@/lib/hive/client-functions', () => ({ getCommunityInfo: vi.fn(), getProfile: vi.fn() }))
vi.mock('@/components/feedback/FeedbackModal', () => ({ default: () => null }))
vi.mock('@/components/shared/Avatar', () => ({ Avatar: () => null }))
vi.mock('@/components/shared/MoodBadgeIcon', () => ({ MoodBadgeIcon: () => null }))
vi.mock('./HiveActivityWidget', () => ({ default: () => null }))
vi.mock('@/components/ui/CountBadge', () => ({ CountBadge: () => null }))
vi.mock('framer-motion', () => ({
  motion: new Proxy({}, { get: () => ({ children }: { children?: React.ReactNode }) => children ?? null }),
}))

// jsdom has no matchMedia; Chakra's breakpoint hooks need it.
if (typeof window.matchMedia !== 'function') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  })
}

afterEach(() => {
  cleanup()
  currentUser = { username: null, isLoggedIn: false }
})

const wrap = (el: React.ReactElement) => render(createElement(ChakraProvider, null, el))
// The desktop sidebar is display:none below the sm breakpoint, which jsdom applies, so include hidden nodes.
const factoryLinks = () => screen.getAllByRole('link', { hidden: true }).filter((a) => a.getAttribute('href') === '/factory')

describe('Butter Factory navigation', () => {
  it('is in the desktop sidebar for a logged-out visitor', () => {
    wrap(createElement(Sidebar))
    const links = factoryLinks()
    expect(links).toHaveLength(1)
    expect(links[0]!.getAttribute('aria-label')).toBe('Butter Factory')
  })

  it('is in the desktop sidebar when signed in', () => {
    currentUser = { username: 'alice', isLoggedIn: true }
    wrap(createElement(Sidebar))
    expect(factoryLinks()).toHaveLength(1)
  })

  it('is in the mobile menu for a logged-out visitor', () => {
    wrap(createElement(MeSheet, { isOpen: true, onClose: vi.fn(), onToggleChat: vi.fn(), chatUnreadCount: 0 }))
    const links = factoryLinks()
    expect(links).toHaveLength(1)
    expect(links[0]!.textContent).toContain('Butter Factory')
  })

  it('is in the mobile menu when signed in', () => {
    currentUser = { username: 'alice', isLoggedIn: true }
    wrap(createElement(MeSheet, { isOpen: true, onClose: vi.fn(), onToggleChat: vi.fn(), chatUnreadCount: 0 }))
    expect(factoryLinks()).toHaveLength(1)
  })
})
