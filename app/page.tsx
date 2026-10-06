import { preload } from 'react-dom';
import HomePage from '@/components/homepage/HomePage';
import { getInitialPublicSnapPage } from '@/lib/hive/publicSnapFeed';
import { homeFeedLcpImageUrl } from '@/lib/images/feedLcp';

// Short window: the public first page is shared by every logged-out visitor.
// Logged-in mutes and following still load on the client.
export const revalidate = 30;

export default async function Page() {
  // Blended "Latest" is a different source (the sidecar). When that flag is
  // on, leave the feed client-side so we don't paint a snaps-only page the
  // client immediately replaces.
  const blended = process.env.NEXT_PUBLIC_ENABLE_BLENDED_FEED === 'true';
  const initialSnapPage = blended ? null : await getInitialPublicSnapPage();
  // The first card's photo is the home LCP element. Preload it from this
  // server component so the request is in the document head, at the same
  // 640px optimizer URL the card's next/image renders.
  const lcpImage = homeFeedLcpImageUrl(initialSnapPage?.comments[0]?.body);
  if (lcpImage) {
    preload(lcpImage, { as: 'image', fetchPriority: 'high' });
  }
  return <HomePage initialSnapPage={initialSnapPage} />;
}
