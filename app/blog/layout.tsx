import type { Metadata } from 'next';
import { buildStaticPageMetadata } from '@/lib/utils/buildMetadata';

// page.tsx is a client component, so the route's metadata lives here.
export const metadata: Metadata = buildStaticPageMetadata({
  path: '/blog',
  title: 'Blogs',
  description: 'Long-form posts from the Hive community, curated on Snapie.',
});

export default function BlogLayout({ children }: { children: React.ReactNode }) {
  return children;
}
