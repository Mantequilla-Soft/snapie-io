import { notFound } from 'next/navigation';
import PostPage from '@/components/blog/PostPage';
import { loadPostForPage } from '@/lib/hive/metadata-functions';
import { isCommunityRoleMuted } from '@/lib/hive/muted-accounts';
import type { Discussion } from '@hiveio/dhive';
import markdownRenderer from '@/lib/utils/MarkdownRenderer';
import { prefetchPostImageDimensions } from '@/lib/images/imageDimensions';
import { headers } from 'next/headers';
import { userAgent } from 'next/server';

/** Crawlers get the post without waiting on image measurement. */
async function requestIsBot(): Promise<boolean> {
  try {
    return userAgent({ headers: await headers() }).isBot;
  } catch {
    return false;
  }
}

export default async function PostView({ author, permlink }: { author: string; permlink: string }) {
  // A real 404 only when Hive answers that this post is empty. A timeout or
  // a down node renders the client page, which retries the fetch itself.
  const lookedUp = await loadPostForPage(author, permlink);
  if (lookedUp.status === 'missing') notFound();
  if (lookedUp.status !== 'found') {
    return <PostPage author={author} permlink={permlink} />;
  }

  // Community-role mutes apply to every visitor, including crawlers. Personal
  // mutes stay on the client. An unknown result omits the body so a failed
  // lookup cannot publish a muted post into the HTML.
  const muted = await isCommunityRoleMuted(lookedUp.post.author);
  if (muted !== false) {
    return <PostPage author={author} permlink={permlink} />;
  }

  const post = lookedUp.post as Discussion;
  const html = markdownRenderer(post.body ?? '', { defaultEmojiOwner: post.author });
  // Width/height for the first few uncached images, within a short budget
  // (see PREFETCH_BUDGET_MS). Skipped for crawlers so they never wait on it.
  const imageDimensions = (await requestIsBot()) ? {} : await prefetchPostImageDimensions(html);
  return (
    <PostPage
      author={author}
      permlink={permlink}
      initialPost={post}
      imageDimensions={imageDimensions}
    />
  );
}
