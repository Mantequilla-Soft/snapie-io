import { describe, expect, it } from 'vitest'
import { parseFactoryMessage } from './messages'

const envelope = (event: unknown) => ({ source: 'butter-factory', event })

describe('parseFactoryMessage', () => {
  it('decodes a week-loaded event', () => {
    expect(parseFactoryMessage(envelope({ type: 'week-loaded', org: 'Mantequilla-Soft', weekStart: '2026-09-28T00:00:00.000Z', events: 212, repos: 12 }))).toEqual({
      type: 'week-loaded', org: 'Mantequilla-Soft', weekStart: '2026-09-28T00:00:00.000Z', events: 212, repos: 12,
    })
  })
  it('decodes an error event and caps its length', () => {
    expect(parseFactoryMessage(envelope({ type: 'error', message: 'The snapshot was not found.' }))).toEqual({ type: 'error', message: 'The snapshot was not found.' })
    const long = parseFactoryMessage(envelope({ type: 'error', message: 'x'.repeat(5000) }))
    expect(long?.type === 'error' && long.message.length).toBe(200)
  })
  it('ignores events this page does not use', () => {
    for (const type of ['ready', 'play', 'pause', 'ended', 'seek', 'select']) {
      expect(parseFactoryMessage(envelope({ type }))).toBeNull()
    }
  })
  it('ignores malformed or foreign messages', () => {
    const bad: unknown[] = [
      null, undefined, 'hello', 42, {}, { event: { type: 'error', message: 'x' } },
      { source: 'other', event: { type: 'error', message: 'x' } },
      envelope(null), envelope('x'), envelope({ type: 'error' }), envelope({ type: 'error', message: 5 }),
      envelope({ type: 'week-loaded', org: 'o', weekStart: '2026-09-28', events: '212', repos: 12 }),
      envelope({ type: 'week-loaded', org: 'o', weekStart: 'not a date', events: 1, repos: 1 }),
      envelope({ type: 'week-loaded', org: 5, weekStart: '2026-09-28', events: 1, repos: 1 }),
    ]
    for (const message of bad) expect(parseFactoryMessage(message)).toBeNull()
  })
})
