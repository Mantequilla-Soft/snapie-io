/**
 * Events the factory embed posts to this page. Only the two this page uses are decoded;
 * everything else is ignored. See "postMessage" in the factory repo's README.
 */
export type FactoryStatus =
  | { type: 'week-loaded'; org: string; weekStart: string; events: number; repos: number }
  | { type: 'error'; message: string }

export const FACTORY_MESSAGE_SOURCE = 'butter-factory'

export function parseFactoryMessage(data: unknown): FactoryStatus | null {
  if (!data || typeof data !== 'object') return null
  const d = data as { source?: unknown; event?: unknown }
  if (d.source !== FACTORY_MESSAGE_SOURCE || !d.event || typeof d.event !== 'object') return null
  const e = d.event as { type?: unknown; org?: unknown; weekStart?: unknown; events?: unknown; repos?: unknown; message?: unknown }
  if (e.type === 'week-loaded') {
    if (typeof e.org !== 'string' || typeof e.weekStart !== 'string' || typeof e.events !== 'number' || typeof e.repos !== 'number') return null
    if (Number.isNaN(Date.parse(e.weekStart))) return null
    return { type: 'week-loaded', org: e.org.slice(0, 100), weekStart: e.weekStart, events: e.events, repos: e.repos }
  }
  if (e.type === 'error' && typeof e.message === 'string') {
    return { type: 'error', message: e.message.slice(0, 200) }
  }
  return null
}
