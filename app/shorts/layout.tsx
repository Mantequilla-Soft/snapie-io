import type { Metadata } from 'next';
import { buildStaticPageMetadata } from '@/lib/utils/buildMetadata';

// page.tsx is a client component, so the route's metadata lives here.
export const metadata: Metadata = buildStaticPageMetadata({
  path: '/shorts',
  title: 'Shorts',
  description: 'Short vertical videos from Hive creators on Snapie.',
});

export default function ShortsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
