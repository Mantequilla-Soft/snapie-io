import type { Metadata } from 'next';
import { getPostForMetadata, getProfileForMetadata } from '@/lib/hive/metadata-functions';
import { buildPostMetadata, buildProfileMetadata } from '@/lib/utils/buildMetadata';
import SlugPageClient from './SlugPageClient';

interface PageProps {
  params: { slug: string[] };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = params;

  if (!slug || slug.length === 0) return {};

  const firstSegment = decodeURIComponent(slug[0]);

  if (!firstSegment.startsWith('@')) return {};

  const username = firstSegment.substring(1);

  // Post page: /@author/permlink
  if (slug.length === 2 && slug[1] !== 'wallet' && slug[1] !== 'notifications') {
    const permlink = decodeURIComponent(slug[1]);
    const post = await getPostForMetadata(username, permlink);
    if (post) {
      return buildPostMetadata(post);
    }
  }

  // 3-segment post page: /@community/@author/permlink
  if (slug.length === 3 && decodeURIComponent(slug[1]).startsWith('@')) {
    const author = decodeURIComponent(slug[1]).substring(1);
    const permlink = decodeURIComponent(slug[2]);
    const post = await getPostForMetadata(author, permlink);
    if (post) {
      return buildPostMetadata(post);
    }
  }

  // Profile page: /@username
  if (slug.length === 1) {
    const profile = await getProfileForMetadata(username);
    if (profile) {
      return buildProfileMetadata(profile);
    }
  }

  return {};
}

export default function SlugPage({ params }: PageProps) {
  return <SlugPageClient slug={params.slug} />;
}
