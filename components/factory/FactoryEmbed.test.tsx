// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, act } from '@testing-library/react'
import { ChakraProvider } from '@chakra-ui/react'
import { createElement } from 'react'
import FactoryEmbed from './FactoryEmbed'

afterEach(() => cleanup())

const ORIGIN = 'https://factory.example'
const mount = () => render(createElement(ChakraProvider, null, createElement(FactoryEmbed, { origin: ORIGIN })))
const frame = () => screen.getByTitle(/Butter Factory/) as HTMLIFrameElement

function post(data: unknown, init: { origin?: string; source?: Window | null } = {}) {
  act(() => {
    window.dispatchEvent(new MessageEvent('message', {
      data,
      origin: init.origin ?? ORIGIN,
      source: init.source === undefined ? frame().contentWindow : init.source,
    }))
  })
}
const weekLoaded = { source: 'butter-factory', event: { type: 'week-loaded', org: 'Mantequilla-Soft', weekStart: '2026-09-28T00:00:00.000Z', events: 212, repos: 12 } }
const failure = { source: 'butter-factory', event: { type: 'error', message: 'The snapshot index was not found.' } }

describe('FactoryEmbed', () => {
  it('frames the factory player from the configured origin with a restricted sandbox', () => {
    mount()
    const f = frame()
    expect(f.getAttribute('src')).toBe(`${ORIGIN}/embed?autoplay=1`)
    expect(f.getAttribute('loading')).toBe('lazy')
    expect(f.getAttribute('referrerpolicy')).toBe('origin')
    expect(f.getAttribute('allow')).toBe('fullscreen')
    const sandbox = f.getAttribute('sandbox') ?? ''
    expect(sandbox).toContain('allow-scripts')
    // The framed app must not be able to navigate this page away or open dialogs over it.
    for (const forbidden of ['allow-top-navigation', 'allow-modals', 'allow-forms']) expect(sandbox).not.toContain(forbidden)
  })

  it('links to the full factory app', () => {
    mount()
    const link = screen.getByRole('link', { name: /Open the full factory/ })
    expect(link.getAttribute('href')).toBe(`${ORIGIN}/`)
    expect(link.getAttribute('rel')).toContain('noopener')
  })

  it('shows which week loaded when the factory reports it', () => {
    mount()
    post(weekLoaded)
    expect(screen.getByText(/Mantequilla-Soft, week of 2026-09-28: 212 events across 12 repos/)).toBeTruthy()
  })

  it('shows a warning when the factory reports an error', () => {
    mount()
    post(failure)
    expect(screen.getByRole('alert').textContent).toContain('The snapshot index was not found.')
  })

  it('renders an error message as plain text, never as markup', () => {
    mount()
    post({ source: 'butter-factory', event: { type: 'error', message: '<img src=x onerror=alert(1)>' } })
    const alert = screen.getByRole('alert')
    expect(alert.querySelector('img')).toBeNull()
    expect(alert.textContent).toContain('<img src=x onerror=alert(1)>')
  })

  it('ignores messages from another origin, another window, or in the wrong shape', () => {
    mount()
    post(weekLoaded, { origin: 'https://evil.example' })
    post(weekLoaded, { source: window })
    post(failure, { source: null })
    post({ source: 'butter-factory', event: { type: 'week-loaded', org: 'o' } })
    post('week-loaded')
    expect(screen.queryByText(/events across/)).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('stops listening once unmounted', () => {
    const { unmount } = mount()
    const contentWindow = frame().contentWindow
    unmount()
    act(() => { window.dispatchEvent(new MessageEvent('message', { data: weekLoaded, origin: ORIGIN, source: contentWindow })) })
    expect(screen.queryByText(/events across/)).toBeNull()
  })
})
