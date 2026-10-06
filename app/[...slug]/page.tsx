import type { Metadata } from 'next';
import PostPage from '@/components/blog/PostPage';
import NotificationsComp from '@/components/notifications/NotificationsComp';
import ProfilePage from '@/components/profile/ProfilePage';
import WalletPage from '@/components/wallet/WalletPage';
import { getPostForMetadata, getProfileForMetadata } from '@/lib/hive/metadata-functions';
import { buildPostMetadata, buildProfileMetadata } from '@/lib/utils/buildMetadata';

interface PageProps {
  params: { slug: string[] };
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    promise,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ]);
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
    const post = await withTimeout(getPostForMetadata(username, permlink), 3000);
    if (post) {
      return buildPostMetadata(post);
    }
  }

  // 3-segment post page: /@community/@author/permlink
  if (slug.length === 3 && decodeURIComponent(slug[1]).startsWith('@')) {
    const author = decodeURIComponent(slug[1]).substring(1);
    const permlink = decodeURIComponent(slug[2]);
    const post = await withTimeout(getPostForMetadata(author, permlink), 3000);
    if (post) {
      return buildPostMetadata(post);
    }
  }

  // Profile page: /@username
  if (slug.length === 1) {
    const profile = await withTimeout(getProfileForMetadata(username), 3000);
    if (profile) {
      return buildProfileMetadata(profile);
    }
  }

  return {};
}

// Static imports, same as before the client next/dynamic() split. A dynamic()
// import only started the view chunk after the shell executed, and Lantern
// counted that second wave on the profile LCP. These imports are part of the
// first HTML instead.
export default function SlugPage({ params }: PageProps) {
  const slug = params.slug ?? [];
  const decoded0 = slug[0] ? decodeURIComponent(slug[0]) : '';
  const decoded1 = slug[1] ? decodeURIComponent(slug[1]) : '';
  const decoded2 = slug[2] ? decodeURIComponent(slug[2]) : '';

  if (slug.length === 1 && decoded0.startsWith('@')) {
    return <ProfilePage username={decoded0.substring(1)} />;
  }
  if (slug.length === 2 && decoded0.startsWith('@') && slug[1] === 'wallet') {
    return <WalletPage username={decoded0.substring(1)} />;
  }
  if (slug.length === 2 && decoded0.startsWith('@') && slug[1] === 'notifications') {
    return <NotificationsComp username={decoded0.substring(1)} />;
  }
  if (slug.length === 2 && decoded0.startsWith('@')) {
    return <PostPage author={decoded0.substring(1)} permlink={decoded1} />;
  }
  if (slug.length === 3 && decoded1.startsWith('@')) {
    return <PostPage author={decoded1.substring(1)} permlink={decoded2} />;
  }
  return null;
}
