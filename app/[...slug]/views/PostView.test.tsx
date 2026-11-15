import { beforeEach, describe, expect, it, vi } from 'vitest';

const getPost = vi.fn();
const communityMuted = vi.fn();
const prefetchDims = vi.fn(async (_html: string) => ({}));
const requestHeaders = { value: new Headers() };

vi.mock('next/headers', () => ({
  headers: async () => requestHeaders.value,
}));

vi.mock('@/lib/images/imageDimensions', () => ({
  prefetchPostImageDimensions: (html: string) => prefetchDims(html),
}));

vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));

vi.mock('@/lib/hive/metadata-functions', () => ({
  loadPostForPage: (...args: unknown[]) => getPost(...args),
}));

vi.mock('@/lib/hive/muted-accounts', () => ({
  isCommunityRoleMuted: (...args: unknown[]) => communityMuted(...args),
}));

vi.mock('@/components/blog/PostPage', () => ({
  default: function PostPage(props: { initialPost?: { author: string } | null }) {
    return props;
  },
}));

import PostView from './PostView';

beforeEach(() => {
  getPost.mockReset();
  communityMuted.mockReset();
  communityMuted.mockResolvedValue(false);
  prefetchDims.mockReset();
  prefetchDims.mockResolvedValue({});
  requestHeaders.value = new Headers({ 'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) Chrome/130.0 Safari/537.36' });
});

describe('PostView', () => {
  it('passes the server post into PostPage for the first HTML', async () => {
    const post = { author: 'alice', permlink: 'p1', title: 'Hello', body: 'World' };
    getPost.mockResolvedValue({ status: 'found', post });
    const element = await PostView({ author: 'alice', permlink: 'p1' });
    expect(element).toMatchObject({
      props: { author: 'alice', permlink: 'p1', initialPost: post },
    });
  });

  it('returns a real 404 when Hive answers that the post is empty', async () => {
    getPost.mockResolvedValue({ status: 'missing' });
    await expect(PostView({ author: 'nosuch', permlink: 'missing' })).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('renders without a server body when the node times out or errors', async () => {
    getPost.mockResolvedValue({ status: 'unknown' });
    const element = await PostView({ author: 'alice', permlink: 'p1' });
    expect(element).toMatchObject({
      props: { author: 'alice', permlink: 'p1' },
    });
    expect(element).not.toMatchObject({ props: { initialPost: expect.anything() } });
    expect(communityMuted).not.toHaveBeenCalled();
  });

  it('keeps a community-muted author out of the server HTML', async () => {
    const post = { author: 'muted', permlink: 'p1', body: 'secret' };
    getPost.mockResolvedValue({ status: 'found', post });
    communityMuted.mockResolvedValue(true);
    const element = await PostView({ author: 'muted', permlink: 'p1' });
    expect(element).not.toMatchObject({ props: { initialPost: expect.anything() } });
  });

  it('keeps the body out of the HTML when the mute list cannot be loaded', async () => {
    const post = { author: 'alice', permlink: 'p1', body: 'maybe muted' };
    getPost.mockResolvedValue({ status: 'found', post });
    communityMuted.mockResolvedValue('unknown');
    const element = await PostView({ author: 'alice', permlink: 'p1' });
    expect(element).not.toMatchObject({ props: { initialPost: expect.anything() } });
  });

  it('measures images for visitors and passes the dimensions through', async () => {
    const post = { author: 'alice', permlink: 'p1', title: 'Hello', body: 'World' };
    getPost.mockResolvedValue({ status: 'found', post });
    prefetchDims.mockResolvedValue({ 'https://files.peakd.com/a.jpg': { width: 10, height: 5 } });
    const element = await PostView({ author: 'alice', permlink: 'p1' });
    expect(prefetchDims).toHaveBeenCalledTimes(1);
    expect(element).toMatchObject({
      props: { imageDimensions: { 'https://files.peakd.com/a.jpg': { width: 10, height: 5 } } },
    });
  });

  it('does not wait on image measurement for crawlers', async () => {
    const post = { author: 'alice', permlink: 'p1', title: 'Hello', body: 'World' };
    getPost.mockResolvedValue({ status: 'found', post });
    requestHeaders.value = new Headers({ 'user-agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)' });
    const element = await PostView({ author: 'alice', permlink: 'p1' });
    expect(prefetchDims).not.toHaveBeenCalled();
    expect(element).toMatchObject({ props: { initialPost: post, imageDimensions: {} } });
  });
});
