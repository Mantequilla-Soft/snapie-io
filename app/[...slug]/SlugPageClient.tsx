'use client';

import PostPage from "@/components/blog/PostPage";
import NotificationsComp from "@/components/notifications/NotificationsComp";
import ProfilePage from "@/components/profile/ProfilePage";
import WalletPage from "@/components/wallet/WalletPage";

interface SlugPageClientProps {
  slug: string[];
}

export default function SlugPageClient({ slug }: SlugPageClientProps) {
  const decoded0 = slug[0] ? decodeURIComponent(slug[0]) : '';
  const decoded1 = slug[1] ? decodeURIComponent(slug[1]) : '';
  const decoded2 = slug[2] ? decodeURIComponent(slug[2]) : '';

  if (slug.length === 1 && decoded0.startsWith('@')) {
    return <ProfilePage username={decoded0.substring(1)} />;
  } else if (slug.length === 2 && decoded0.startsWith('@') && slug[1] === 'wallet') {
    return <WalletPage username={decoded0.substring(1)} />;
  } else if (slug.length === 2 && decoded0.startsWith('@') && slug[1] === 'notifications') {
    return <NotificationsComp username={decoded0.substring(1)} />;
  } else if (slug.length === 2 && decoded0.startsWith('@')) {
    return <PostPage author={decoded0.substring(1)} permlink={decoded1} />;
  } else if (slug.length === 3 && decoded1.startsWith('@')) {
    return <PostPage author={decoded1.substring(1)} permlink={decoded2} />;
  }

  return null;
}
