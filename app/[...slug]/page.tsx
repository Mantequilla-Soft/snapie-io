import type { Metadata } from 'next';
import { metadataForSlug } from './metadata';

interface PageProps {
  params: { slug: string[] };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  return metadataForSlug(params.slug ?? []);
}

// One- and two-segment profile, post, wallet, and notification URLs have
// their own routes so each response only ships that view. This catch-all
// still renders a community-prefixed post (/community/@author/permlink).
export default async function SlugPage({ params }: PageProps) {
  const slug = params.slug ?? [];
  const decoded1 = slug[1] ? decodeURIComponent(slug[1]) : '';
  const decoded2 = slug[2] ? decodeURIComponent(slug[2]) : '';

  if (slug.length === 3 && decoded1.startsWith('@')) {
    const { default: PostView } = await import('./views/PostView');
    return <PostView author={decoded1.substring(1)} permlink={decoded2} />;
  }

  return null;
}
