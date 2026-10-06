import { preload } from 'react-dom';
import HomePage from '@/components/homepage/HomePage';
import { getInitialPublicSnapPage } from '@/lib/hive/publicSnapFeed';
import { firstScreenLcpImageUrl } from '@/lib/images/feedLcp';
import { SSR_PAINTED_SNAP_COUNT } from '@/lib/hive/publicSnapPage';

// Short window: the public first page is shared by every logged-out visitor.
// Logged-in mutes and following still load on the client.
export const revalidate = 30;

export default async function Page() {
  // Blended "Latest" is a different source (the sidecar). When that flag is
  // on, leave the feed client-side so we don't paint a snaps-only page the
  // client immediately replaces.
  const blended = process.env.NEXT_PUBLIC_ENABLE_BLENDED_FEED === 'true';
  const initialSnapPage = blended ? null : await getInitialPublicSnapPage();
  // A photo in the first screen is the home LCP element once it paints.
  // Card 0 is often text; the next painted snap's image is then larger.
  // Preload that URL from this server component so it matches next/image.
  const lcpImage = firstScreenLcpImageUrl(
    (initialSnapPage?.comments ?? []).slice(0, SSR_PAINTED_SNAP_COUNT).map((comment) => comment.body),
  );
  if (lcpImage) {
    preload(lcpImage, { as: 'image', fetchPriority: 'high' });
  }
  return <HomePage initialSnapPage={initialSnapPage} />;
}
