/**
 * Where the Butter Factory (github.com/Mantequilla-Soft/factory-island-sim) is published.
 * Override with NEXT_PUBLIC_FACTORY_URL, for example once it moves to its own domain.
 */
export const DEFAULT_FACTORY_URL = 'https://factory-island-sim.lovable.app'

/** The value must be an https origin (http only for localhost). Anything else falls back to the default. */
export function resolveFactoryOrigin(raw: string | undefined): string {
  const value = raw?.trim()
  if (!value) return DEFAULT_FACTORY_URL
  try {
    const url = new URL(value)
    const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1'
    if (url.protocol === 'https:' || (url.protocol === 'http:' && local)) return url.origin
  } catch {
    // fall through
  }
  return DEFAULT_FACTORY_URL
}

export const FACTORY_ORIGIN = resolveFactoryOrigin(process.env.NEXT_PUBLIC_FACTORY_URL)

/** The chrome-less player. Autoplay is skipped by the player itself for reduced-motion viewers. */
export const factoryEmbedUrl = (origin: string = FACTORY_ORIGIN) => `${origin}/embed?autoplay=1`

/** The full app, with the activity feed and "week in numbers". */
export const factoryAppUrl = (origin: string = FACTORY_ORIGIN) => `${origin}/`
