import { describe, expect, it, vi } from 'vitest';
import {
  FEED_LCP_AUDIT_DEADLINE_MS,
  FEED_LCP_WIDTH,
  HOME_FEED_LCP_SCAN,
  LCP_MEDIA_SIZE_CAP_BYTES,
  auditFirstScreenLcp,
  classifyFeedMediaUrl,
  feedImageLoad,
  feedLcpImageUrl,
  firstScreenLcpImageUrl,
  hasMarkdownImage,
  heavyFeedMediaUrls,
  homeFeedLcpImageUrl,
  isPlainFeedImageMedia,
  isSuitableLcpCandidate,
  lcpCandidateNeedsProbe,
  mediaHasEmbed,
  normalizeFeedLcpBodies,
  paintedPriorityImageUrl,
  selectFirstScreenLcpImage,
  shouldDeferFeedMedia,
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
    expect(classifyFeedMediaUrl('https://cdn.example.com/clip', 'video/mp4')).toBe('video');
    expect(classifyFeedMediaUrl('https://cdn.example.com/a.webm')).toBe('video');
  });
});

describe('feedImageLoad', () => {
  it('keeps a photo eager and unmarked', () => {
    expect(feedImageLoad('https://images.hive.blog/photo.jpg')).toEqual({
      priority: false,
      loading: 'eager',
    });
  });

  it('gives priority only to a photo the caller chose', () => {
    expect(feedImageLoad('https://images.hive.blog/photo.png', { priority: true })).toEqual({
      priority: true,
      loading: 'eager',
      fetchPriority: 'high',
    });
  });

  it('never gives a GIF eager or high-priority treatment', () => {
    expect(feedImageLoad('https://media.giphy.com/media/abc/giphy.gif', { priority: true })).toEqual({
      priority: false,
      loading: 'lazy',
      fetchPriority: 'low',
    });
    expect(feedImageLoad('https://i.imgur.com/anim.GIF')).toMatchObject({
      priority: false,
      loading: 'lazy',
      fetchPriority: 'low',
    });
    expect(classifyFeedMediaUrl('https://cdn.example.com/x.jpg', 'image/gif')).toBe('gif');
  });

  it('defers video and an explicitly oversized URL', () => {
    expect(feedImageLoad('https://cdn.example.com/clip.mp4', { priority: true }).loading).toBe('lazy');
    expect(feedImageLoad('https://images.hive.blog/huge.jpg', { defer: true })).toEqual({
      priority: false,
      loading: 'lazy',
      fetchPriority: 'low',
    });
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

  it('defers the GIF and the oversized photo, and keeps the later small photo', async () => {
    const decision = await auditFirstScreenLcp([gif, big, small], async (url) => {
      if (url.endsWith('huge.jpg')) return { contentType: 'image/jpeg', contentLength: 2_000_000 };
      if (url.endsWith('small.webp')) return { contentType: 'image/webp', contentLength: 80_000 };
      return null;
    });
    expect(decision.chosen?.rawUrl).toBe('https://images.hive.blog/small.webp');
    expect(decision.deferUrls).toEqual([
      'https://media.giphy.com/media/abc/giphy.gif',
      'https://images.hive.blog/huge.jpg',
    ]);
    expect(heavyFeedMediaUrls([gif, small])).toEqual([
      'https://media.giphy.com/media/abc/giphy.gif',
    ]);
  });

  it('keeps a known photo when HEAD fails, and skips an extensionless URL when HEAD fails', async () => {
    const probe = vi.fn(async () => null);
    const chosen = await selectFirstScreenLcpImage([ipfs, small], probe);
    expect(chosen?.rawUrl).toBe('https://images.hive.blog/small.webp');
    expect(isSuitableLcpCandidate('https://images.hive.blog/small.webp', null)).toBe(true);
    expect(isSuitableLcpCandidate('https://ipfs.3speak.tv/ipfs/QmExample', null)).toBe(false);
    expect(shouldDeferFeedMedia('https://images.hive.blog/small.webp', null)).toBe(false);
    expect(shouldDeferFeedMedia('https://ipfs.3speak.tv/ipfs/QmExample', null)).toBe(false);
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
    expect(shouldDeferFeedMedia('https://ipfs.3speak.tv/ipfs/QmExample', {
      contentType: 'application/octet-stream',
      contentLength: 6_000_000,
    })).toBe(true);
    expect(shouldDeferFeedMedia('https://images.hive.blog/huge.jpg', {
      contentType: 'image/jpeg',
      contentLength: LCP_MEDIA_SIZE_CAP_BYTES,
    })).toBe(false);
    expect(shouldDeferFeedMedia('https://images.hive.blog/huge.jpg', {
      contentType: 'image/jpeg',
      contentLength: LCP_MEDIA_SIZE_CAP_BYTES + 1,
    })).toBe(true);
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
    expect(shouldDeferFeedMedia('https://images.hive.blog/not-really.jpg', {
      contentType: 'image/gif',
      contentLength: 50_000,
    })).toBe(true);
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

  it('falls back to the extension-only pick when the audit exceeds its deadline', async () => {
    vi.useFakeTimers();
    try {
      const pending = auditFirstScreenLcp(
        [gif, big, small],
        () => new Promise(() => {}),
      );
      const assertion = expect(pending).resolves.toEqual({
        chosen: expect.objectContaining({ rawUrl: 'https://images.hive.blog/huge.jpg' }),
        deferUrls: ['https://media.giphy.com/media/abc/giphy.gif'],
      });
      await vi.advanceTimersByTimeAsync(FEED_LCP_AUDIT_DEADLINE_MS);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
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

describe('normalizeFeedLcpBodies', () => {
  it('keeps only the leading scan window', () => {
    const bodies = Array.from({ length: HOME_FEED_LCP_SCAN + 3 }, (_, i) => `body-${i}`);
    const normalized = normalizeFeedLcpBodies({ bodies });
    expect(normalized).toHaveLength(HOME_FEED_LCP_SCAN);
    expect(normalized?.[0]).toBe('body-0');
    expect(normalizeFeedLcpBodies({ bodies: 'nope' })).toBeNull();
    expect(normalizeFeedLcpBodies(null)).toBeNull();
  });
});
