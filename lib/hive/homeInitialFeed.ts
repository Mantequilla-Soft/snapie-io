import { getInitialPublicBlendedPage } from '@/lib/hive/publicBlendedFeed';
import { getInitialPublicSnapPage } from '@/lib/hive/publicSnapFeed';
import { renderSnapBodyHtml } from '@/lib/hive/renderSnapBodyHtml';
import type { PublicSnapPage } from '@/lib/hive/publicSnapPage';

/** Markdown HTML for the home seed, so the first cards hydrate without the
 *  client markdown package. Shared by the snaps walk and blended Latest. */
export function withRenderedSnapBody(page: PublicSnapPage | null): PublicSnapPage | null {
  if (!page) return null;
  return {
    ...page,
    comments: page.comments.map((comment) => ({
      ...comment,
      bodyHtml: renderSnapBodyHtml(comment.body || '', comment.author),
    })),
  };
}

/** First page serialized into `/`. Blended Latest uses the sidecar seed;
 *  otherwise the snaps container seed. Either way the result is null only
 *  when that source had nothing to paint. */
export async function loadHomeInitialSnapPage(): Promise<PublicSnapPage | null> {
  const blended = process.env.NEXT_PUBLIC_ENABLE_BLENDED_FEED === 'true';
  const page = blended
    ? await getInitialPublicBlendedPage()
    : await getInitialPublicSnapPage();
  return withRenderedSnapBody(page);
}
