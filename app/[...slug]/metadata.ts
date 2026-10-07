import type { Metadata } from 'next';
import { getPostForMetadata, getProfileForMetadata } from '@/lib/hive/metadata-functions';
import { buildPostMetadata, buildProfileMetadata } from '@/lib/utils/buildMetadata';

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    promise,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ]);
}

export async function metadataForSlug(slug: string[]): Promise<Metadata> {
  if (!slug || slug.length === 0) return {};

  const firstSegment = decodeURIComponent(slug[0]);
  if (!firstSegment.startsWith('@')) return {};

  const username = firstSegment.substring(1);

  if (slug.length === 2 && slug[1] !== 'wallet' && slug[1] !== 'notifications') {
    const permlink = decodeURIComponent(slug[1]);
    const post = await withTimeout(getPostForMetadata(username, permlink), 3000);
    if (post) return buildPostMetadata(post);
  }

  if (slug.length === 3 && decodeURIComponent(slug[1]).startsWith('@')) {
    const author = decodeURIComponent(slug[1]).substring(1);
    const permlink = decodeURIComponent(slug[2]);
    const post = await withTimeout(getPostForMetadata(author, permlink), 3000);
    if (post) return buildPostMetadata(post);
  }

  if (slug.length === 1) {
    const profile = await withTimeout(getProfileForMetadata(username), 3000);
    if (profile) return buildProfileMetadata(profile);
  }

  return {};
}
