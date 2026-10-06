import { describe, expect, it } from 'vitest';
import { FEED_LCP_WIDTH, feedLcpImageUrl, homeFeedLcpImageUrl, isPlainFeedImageMedia } from './feedLcp';

describe('feedLcpImageUrl', () => {
  it('asks the optimizer for a fixed 640px image through the same-origin proxy', () => {
    const src = '/api/image-proxy?url=https%3A%2F%2Fimages.hive.blog%2Fphoto.jpg';
    const url = feedLcpImageUrl(src);
    expect(FEED_LCP_WIDTH).toBe(640);
    expect(url).toContain('/_next/image?url=');
    expect(url).toContain('w=640');
    expect(url).toContain('q=75');
    expect(decodeURIComponent(url)).toContain(src);
    expect(url.startsWith('/_next/image?')).toBe(true);
  });

  it('keeps a caller-supplied quality', () => {
    expect(feedLcpImageUrl('/api/image-proxy?url=https%3A%2F%2Fexample.com%2Fa.jpg', 60)).toContain('q=60');
  });
});

describe('homeFeedLcpImageUrl', () => {
  const body = [
    'Street art',
    'https://www.reddit.com/r/streetart/comments/abc/from_town/',
    '![](https://images.hive.blog/photo.jpg)',
    '![](https://images.hive.blog/other.jpg)',
  ].join('\n');

  it('preloads the first plain image through the proxy at 640px', () => {
    const url = homeFeedLcpImageUrl(body);
    expect(url).toBeTruthy();
    expect(url).toContain('/_next/image?url=');
    expect(url).toContain('w=640');
    const decoded = decodeURIComponent(decodeURIComponent(url!));
    expect(decoded).toContain('/api/image-proxy?url=');
    expect(decoded).toContain('https://images.hive.blog/photo.jpg');
    expect(decoded).not.toContain('other.jpg');
  });

  it('skips a card whose media is a video embed', () => {
    expect(isPlainFeedImageMedia('https://www.youtube.com/watch?v=abc\n![](https://images.hive.blog/a.jpg)')).toBe(false);
    expect(homeFeedLcpImageUrl('Watch\nhttps://youtu.be/abc\n![](https://images.hive.blog/a.jpg)')).toBeNull();
  });

  it('skips text-only snaps', () => {
    expect(homeFeedLcpImageUrl('just words')).toBeNull();
    expect(homeFeedLcpImageUrl(null)).toBeNull();
  });
});
