import type { Metadata } from 'next';
import { buildStaticPageMetadata } from '@/lib/utils/buildMetadata';

// page.tsx is a client component, so the route's metadata lives here.
export const metadata: Metadata = buildStaticPageMetadata({
  path: '/changelog',
  title: "What's new",
  description: 'Everything shipped on Snapie, newest first.',
});

export default function ChangelogLayout({ children }: { children: React.ReactNode }) {
  return children;
}
