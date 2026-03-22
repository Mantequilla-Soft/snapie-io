'use client';

import PostPage from "@/components/blog/PostPage";
import NotificationsComp from "@/components/notifications/NotificationsComp";
import ProfilePage from "@/components/profile/ProfilePage";
import WalletPage from "@/components/wallet/WalletPage";

interface SlugPageClientProps {
  slug: string[];
}

export default function SlugPageClient({ slug }: SlugPageClientProps) {
    if (slug.length === 1 && decodeURIComponent(slug[0]).startsWith('@')) {
      return (
        <ProfilePage username={decodeURIComponent(slug[0]).substring(1)} />
      )
    } else if ((slug.length === 2 && decodeURIComponent(slug[0]).startsWith('@')) && slug[1] === 'wallet') {
      return (
        <WalletPage username={decodeURIComponent(slug[0]).slice(1)} />
      )
    } else if ((slug.length === 2 && decodeURIComponent(slug[0]).startsWith('@')) && slug[1] === 'notifications') {
      return (
        <NotificationsComp username={decodeURIComponent(slug[0]).slice(1)} />
      )
    } else if ((slug.length === 2 && decodeURIComponent(slug[0]).startsWith('@')) || (slug.length === 3 && decodeURIComponent(slug[1]).startsWith('@'))) {
      return (
        <PostPage author={decodeURIComponent(slug[0]).substring(1)} permlink={slug[1]} />
      )
    }

  return (
    <></>
  );
}
