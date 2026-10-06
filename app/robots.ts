import type { MetadataRoute } from 'next'

// Public pages stay allowed. These paths are account tools or a sanitize
// fixture, not content. There is no sitemap route, so none is listed here.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/settings/admin', '/compose', '/edit', '/test-sanitize'],
    },
  }
}
