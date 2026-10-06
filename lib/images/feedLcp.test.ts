import { describe, expect, it, vi } from 'vitest';
import {
  FEED_IMAGE_ASPECT_RATIO,
  FEED_LCP_WIDTH,
  LCP_MEDIA_SIZE_CAP_BYTES,
  classifyFeedMediaUrl,
  feedLcpImageUrl,
  feedMediaSlotAspect,
  firstScreenLcpImageUrl,
  hasMarkdownImage,
  homeFeedLcpImageUrl,
  isPlainFeedImageMedia,
  isSuitableLcpCandidate,
  lcpCandidateNeedsProbe,
  mediaHasEmbed,
  paintedPriorityImageUrl,
  selectFirstScreenLcpImage,
} from './feedLcp';

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

  it('treats a 3speak CDN photo as an image, and a 3speak player url as an embed', () => {
    const photo = '![](https://ipfs.3speak.tv/ipfs/QmExample)';
    expect(hasMarkdownImage(photo)).toBe(true);
    expect(isPlainFeedImageMedia(photo)).toBe(true);
    expect(homeFeedLcpImageUrl(photo)).toContain('w=640');
    expect(isPlainFeedImageMedia('https://3speak.tv/watch?v=abc')).toBe(false);
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

  it('does not preload a leading GIF when a later photo is in the first screen', () => {
    const url = firstScreenLcpImageUrl([
      '![](https://media.giphy.com/media/abc/giphy.gif)',
      '![](https://images.hive.blog/photo.jpg)',
    ]);
    expect(url).toContain('w=640');
    expect(decodeURIComponent(decodeURIComponent(url || ''))).toContain('photo.jpg');
    expect(decodeURIComponent(url || '')).not.toContain('giphy.gif');
    expect(homeFeedLcpImageUrl('![](https://i.imgur.com/anim.GIF)')).toBeNull();
  });

  it('does not preload a markdown video', () => {
    expect(firstScreenLcpImageUrl([
      '![](https://cdn.example.com/clip.mp4)',
      '![](https://images.hive.blog/still.png)',
    ])).toContain('still.png');
    expect(classifyFeedMediaUrl('https://i.imgur.com/clip.gifv')).toBe('video');
  });
});

describe('selectFirstScreenLcpImage', () => {
  const gif = '![](https://media.giphy.com/media/abc/giphy.gif)';
  const big = '![](https://images.hive.blog/huge.jpg)';
  const small = '![](https://images.hive.blog/small.webp)';
  const ipfs = '![](https://ipfs.3speak.tv/ipfs/QmExample)';

  it('caps priority media at 300 KB', () => {
    expect(LCP_MEDIA_SIZE_CAP_BYTES).toBe(300_000);
  });

  it('skips a GIF without probing it and preloads the next photo through the proxy', async () => {
    const probe = vi.fn(async (url: string) => {
      if (url.endsWith('huge.jpg')) return { contentType: 'image/jpeg', contentLength: 2_000_000 };
      if (url.endsWith('small.webp')) return { contentType: 'image/webp', contentLength: 80_000 };
      return { contentType: 'image/gif', contentLength: 6_000_000 };
    });
    const chosen = await selectFirstScreenLcpImage([gif, big, small], probe);
    expect(probe.mock.calls.map((call) => call[0])).not.toContain('https://media.giphy.com/media/abc/giphy.gif');
    expect(lcpCandidateNeedsProbe('https://media.giphy.com/media/abc/giphy.gif')).toBe(false);
    expect(chosen?.rawUrl).toBe('https://images.hive.blog/small.webp');
    expect(chosen?.optimizerUrl).toContain('/_next/image?url=');
    expect(chosen?.optimizerUrl).toContain('w=640');
    expect(decodeURIComponent(chosen?.optimizerUrl || '')).toContain('/api/image-proxy?url=');
    expect(decodeURIComponent(decodeURIComponent(chosen?.optimizerUrl || ''))).toContain('small.webp');
  });

  it('keeps a known photo when HEAD fails, and skips an extensionless URL when HEAD fails', async () => {
    const probe = vi.fn(async () => null);
    const chosen = await selectFirstScreenLcpImage([ipfs, small], probe);
    expect(chosen?.rawUrl).toBe('https://images.hive.blog/small.webp');
    expect(isSuitableLcpCandidate('https://images.hive.blog/small.webp', null)).toBe(true);
    expect(isSuitableLcpCandidate('https://ipfs.3speak.tv/ipfs/QmExample', null)).toBe(false);
  });

  it('accepts an extensionless photo when HEAD reports a photo type under the cap', async () => {
    const chosen = await selectFirstScreenLcpImage([ipfs, small], async (url) => {
      if (url.includes('QmExample')) return { contentType: 'image/jpeg', contentLength: 120_000 };
      return { contentType: 'image/webp', contentLength: 10_000 };
    });
    expect(chosen?.rawUrl).toContain('QmExample');
  });

  it('accepts a small extensionless file with a generic content-type', async () => {
    expect(isSuitableLcpCandidate('https://ipfs.3speak.tv/ipfs/QmExample', {
      contentType: 'application/octet-stream',
      contentLength: 40_000,
    })).toBe(true);
    expect(isSuitableLcpCandidate('https://ipfs.3speak.tv/ipfs/QmExample', {
      contentType: 'application/octet-stream',
      contentLength: 6_000_000,
    })).toBe(false);
  });

  it('treats a photo URL that HEADs as image/gif as a GIF', async () => {
    const chosen = await selectFirstScreenLcpImage([
      '![](https://images.hive.blog/not-really.jpg)',
      small,
    ], async (url) => (
      url.endsWith('.jpg')
        ? { contentType: 'image/gif', contentLength: 50_000 }
        : { contentType: 'image/webp', contentLength: 20_000 }
    ));
    expect(chosen?.rawUrl).toContain('small.webp');
  });

  it('returns null when every first-screen image is a GIF, a video, or over the cap', async () => {
    const chosen = await selectFirstScreenLcpImage([
      gif,
      '![](https://cdn.example.com/clip.webm)',
      big,
    ], async () => ({ contentType: 'image/jpeg', contentLength: LCP_MEDIA_SIZE_CAP_BYTES + 1 }));
    expect(chosen).toBeNull();
  });

  it('keeps a photo whose Content-Length is exactly the cap', async () => {
    const chosen = await selectFirstScreenLcpImage([big], async () => ({
      contentType: 'image/jpeg',
      contentLength: LCP_MEDIA_SIZE_CAP_BYTES,
    }));
    expect(chosen?.rawUrl).toContain('huge.jpg');
  });

  it('does not mark priority when the server rejected every candidate', () => {
    expect(paintedPriorityImageUrl([
      '![](https://images.hive.blog/huge.jpg)',
      '![](https://images.hive.blog/small.webp)',
    ], 5, null)).toBeNull();
  });

  it('uses the server choice even when the extension picker would pick an earlier photo', () => {
    const url = paintedPriorityImageUrl([
      '![](https://images.hive.blog/huge.jpg)',
      '![](https://images.hive.blog/small.webp)',
    ], 5, 'https://images.hive.blog/small.webp');
    expect(url).toBe('https://images.hive.blog/small.webp');
  });

  it('falls back to the next photo when the server choice is gone, and still skips GIFs', () => {
    expect(paintedPriorityImageUrl([
      gif,
      '![](https://images.hive.blog/small.webp)',
    ], 5, 'https://images.hive.blog/gone.jpg')).toBe('https://images.hive.blog/small.webp');
  });
});
