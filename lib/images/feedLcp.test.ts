import { describe, expect, it } from 'vitest';
import { FEED_IMAGE_ASPECT_RATIO, FEED_LCP_WIDTH, feedLcpImageUrl, feedMediaSlotAspect, firstScreenLcpImageUrl, homeFeedLcpImageUrl, isPlainFeedImageMedia, mediaHasEmbed } from './feedLcp';

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

  it('treats a reddit link beside photos as an embed, not as the image', () => {
    const media = [
      'https://www.reddit.com/r/streetart/comments/abc/from_town/',
      '![](https://images.hive.blog/photo.jpg)',
    ].join('\n');
    expect(mediaHasEmbed(media)).toBe(true);
    expect(isPlainFeedImageMedia(media)).toBe(true);
    expect(mediaHasEmbed('![](https://images.hive.blog/photo.jpg)')).toBe(false);
  });

  it('skips text-only snaps', () => {
    expect(homeFeedLcpImageUrl('just words')).toBeNull();
    expect(homeFeedLcpImageUrl(null)).toBeNull();
  });

  it('reserves a stable slot for photos and horizontal embeds', () => {
    expect(FEED_IMAGE_ASPECT_RATIO).toBeCloseTo(4 / 3);
    expect(feedMediaSlotAspect('![](https://images.hive.blog/photo.jpg)')).toBe(FEED_IMAGE_ASPECT_RATIO);
    expect(feedMediaSlotAspect('https://www.youtube.com/watch?v=abc12345678')).toBe(16 / 9);
    expect(feedMediaSlotAspect('https://www.youtube.com/shorts/abc12345678')).toBe(9 / 16);
    expect(feedMediaSlotAspect('https://play.3speak.tv/embed?v=user/permlink')).toBe(16 / 9);
    expect(feedMediaSlotAspect('https://audio.3speak.tv/play?a=user/permlink')).toBeUndefined();
    expect(feedMediaSlotAspect('just words')).toBeUndefined();
  });

  it('uses the next painted snap when the first card has no image', () => {
    const url = firstScreenLcpImageUrl([
      'just words',
      null,
      '![](https://images.hive.blog/photo.jpg)',
    ]);
    expect(url).toContain('w=640');
    expect(decodeURIComponent(url || '')).toContain('/api/image-proxy?url=');
    expect(firstScreenLcpImageUrl(['just words', null])).toBeNull();
  });
});
