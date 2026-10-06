import { preload } from 'react-dom';
import HomePage from '@/components/homepage/HomePage';
import { getInitialPublicSnapPage } from '@/lib/hive/publicSnapFeed';
import { renderSnapBodyHtml } from '@/lib/hive/renderSnapBodyHtml';
import { inspectFirstScreenMedia } from '@/lib/images/feedLcp';
import { probeFeedImageHead } from '@/lib/images/feedLcpProbe';
import { SSR_PAINTED_SNAP_COUNT, type PublicSnapPage } from '@/lib/hive/publicSnapPage';

// Short window: the public first page is shared by every logged-out visitor.
// Logged-in mutes and following still load on the client.
export const revalidate = 30;

function withRenderedBody(page: PublicSnapPage | null): PublicSnapPage | null {
  if (!page) return null;
  return {
    ...page,
    comments: page.comments.map((comment) => ({
      ...comment,
      bodyHtml: renderSnapBodyHtml(comment.body || '', comment.author),
    })),
  };
}

export default async function Page() {
  // Blended "Latest" is a different source (the sidecar). When that flag is
  // on, leave the feed client-side so we don't paint a snaps-only page the
  // client immediately replaces.
  const blended = process.env.NEXT_PUBLIC_ENABLE_BLENDED_FEED === 'true';
  const initialSnapPage = blended ? null : withRenderedBody(await getInitialPublicSnapPage());
  // A photo in the first screen is the home LCP element once it paints.
  // GIF, video, and anything over the size cap are not preloaded; the next
  // suitable photo is. Framework-script deferral stays off unless
  // SNAPIE_DEFER_FRAMEWORK_SCRIPTS is exactly "1".
  const lcpBodies = (initialSnapPage?.comments ?? [])
    .slice(0, SSR_PAINTED_SNAP_COUNT)
    .map((comment) => comment.body);
  // GIF and video stay out of the priority slot. Their URLs are passed down
  // so a file with no extension still is not fetched beside the LCP photo.
  const mediaPlan = initialSnapPage
    ? await inspectFirstScreenMedia(lcpBodies, probeFeedImageHead)
    : null;
  const lcpImage = mediaPlan?.lcp ?? null;
  if (lcpImage) {
    preload(lcpImage.optimizerUrl, { as: 'image', fetchPriority: 'high' });
  }
  return (
    <HomePage
      initialSnapPage={initialSnapPage}
      lcpImageUrl={initialSnapPage ? (lcpImage?.rawUrl ?? null) : undefined}
      deferredMediaUrls={mediaPlan?.deferredUrls}
    />
  );
}
