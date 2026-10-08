import type { Metadata } from 'next';
import { metadataForSlug } from './metadata';
import PostView from './views/PostView';

interface PageProps {
  params: Promise<{ slug: string[] }>;
}

export async function generateMetadata(props: PageProps): Promise<Metadata> {
  const params = await props.params;
  return metadataForSlug(params.slug ?? []);
}

// One- and two-segment profile, post, wallet, and notification URLs have
// their own routes so each response only ships that view. This catch-all
// still renders a community-prefixed post (/community/@author/permlink).
// Static import, same as the dedicated routes: a dynamic() import only
// started the view chunk after the shell executed, and that second wave
// landed on the profile LCP.
export default async function SlugPage(props: PageProps) {
  const params = await props.params;
  const slug = params.slug ?? [];
  const decoded1 = slug[1] ? decodeURIComponent(slug[1]) : '';
  const decoded2 = slug[2] ? decodeURIComponent(slug[2]) : '';

  if (slug.length === 3 && decoded1.startsWith('@')) {
    return <PostView author={decoded1.substring(1)} permlink={decoded2} />;
  }

  return null;
}
