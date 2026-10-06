// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor, act } from '@testing-library/react';
import { createElement } from 'react';
import ImageWithFallback from './ImageWithFallback';
import { DeferredMediaUrlProvider } from './DeferredFeedMedia';
import { FEED_IMAGE_ASPECT_RATIO } from '@/lib/images/feedLcp';

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
  vi.useRealTimers();
});

// Regression test: a failed image (dead link, expired CDN URL, or a
// browser/ad-blocker silently refusing the request) used to just vanish —
// onError set display:none with zero fallback UI, so a broken image and a
// post that never had one looked identical. Confirmed live with a real
// ad-blocked Twitter thumbnail URL before this fix existed.

function decodedSrc(img: Element | null): string {
  // next/image percent-encodes the proxy src, and the proxy percent-encodes
  // the upstream URL, so the attribute needs two passes to show the original.
  let src = img?.getAttribute('src') ?? '';
  for (let i = 0; i < 2; i += 1) {
    try {
      const next = decodeURIComponent(src);
      if (next === src) break;
      src = next;
    } catch {
      break;
    }
  }
  return src;
}

describe('ImageWithFallback', () => {
  it('renders the image normally before any error', () => {
    const { container } = render(createElement(ImageWithFallback, { url: 'https://example.com/pic.jpg', alt: 'a photo' }));
    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    // next/image optimizes a same-origin proxy URL, not the raw remote host.
    const src = decodedSrc(img);
    expect(src).toContain('/api/image-proxy?url=');
    expect(src).toContain('https://example.com/pic.jpg');
    expect(img?.getAttribute('alt')).toBe('a photo');
    expect(img?.getAttribute('loading')).toBe('eager');
    expect(screen.queryByText('Image failed to load.')).toBeNull();
  });

  it('paints the priority image immediately at a fixed 640px optimizer width', () => {
    const { container } = render(createElement(ImageWithFallback, {
      url: 'https://example.com/pic.jpg',
      alt: 'a photo',
      priority: true,
    }));
    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    const src = img?.getAttribute('src') ?? '';
    const decoded = decodedSrc(img);
    expect(src).toContain('/_next/image');
    expect(src).toContain('w=640');
    expect(decoded).toContain('/api/image-proxy?url=');
    expect(decoded).toContain('https://example.com/pic.jpg');
    expect(img?.getAttribute('fetchpriority')).toBe('high');
    expect(img?.getAttribute('loading')).not.toBe('lazy');
    expect(img?.getAttribute('decoding')).toBe('sync');
    expect(img?.getAttribute('style') ?? '').not.toContain('opacity: 0');
    expect(container.querySelector('[class*="chakra-skeleton"]')).toBeNull();
  });

  it('paints a non-priority first-viewport image at 640px without a fade or preload', () => {
    const { container } = render(createElement(ImageWithFallback, {
      url: 'https://example.com/pic.jpg',
      alt: 'a photo',
      painted: true,
    }));
    const img = container.querySelector('img');
    expect(img?.getAttribute('src') ?? '').toContain('w=640');
    expect(img?.getAttribute('fetchpriority')).not.toBe('high');
    expect(img?.getAttribute('style') ?? '').not.toContain('opacity: 0');
    expect(container.querySelector('[class*="chakra-skeleton"]')).toBeNull();
  });

  it('does not request a painted sibling while the priority image is still loading', async () => {
    const priority = document.createElement('img');
    priority.setAttribute('fetchpriority', 'high');
    Object.defineProperty(priority, 'complete', { configurable: true, get: () => false });
    document.body.appendChild(priority);
    try {
      const { container } = render(createElement(ImageWithFallback, {
        url: 'https://example.com/other.jpg',
        alt: 'other',
        painted: true,
      }));
      expect(container.querySelector('img')).toBeNull();
      expect(container.querySelector('[data-feed-image-held]')).not.toBeNull();
      priority.dispatchEvent(new Event('load'));
      await waitFor(() => {
        expect(container.querySelector('img')).not.toBeNull();
      });
      expect(decodedSrc(container.querySelector('img'))).toContain('https://example.com/other.jpg');
      expect(container.querySelector('img')?.getAttribute('fetchpriority')).not.toBe('high');
    } finally {
      priority.remove();
    }
  });

  it('holds a non-painted photo while the priority image is still loading', async () => {
    const priority = document.createElement('img');
    priority.setAttribute('fetchpriority', 'high');
    Object.defineProperty(priority, 'complete', { configurable: true, get: () => false });
    document.body.appendChild(priority);
    try {
      const { container } = render(createElement(ImageWithFallback, {
        url: 'https://example.com/below.jpg',
        alt: 'below',
      }));
      expect(container.querySelector('img')).toBeNull();
      expect(container.querySelector('[data-feed-image-held]')).not.toBeNull();
      priority.dispatchEvent(new Event('load'));
      await waitFor(() => {
        expect(decodedSrc(container.querySelector('img'))).toContain('https://example.com/below.jpg');
      });
    } finally {
      priority.remove();
    }
  });

  it('optimizes a same-origin path directly instead of proxying it', () => {
    const { container } = render(createElement(ImageWithFallback, { url: '/logo.png', alt: 'logo' }));
    const src = decodedSrc(container.querySelector('img'));
    expect(src).toContain('/logo.png');
    expect(src).not.toContain('/api/image-proxy');
  });

  it('keeps a neutral tile with no broken image once the load fails', () => {
    const { container } = render(createElement(ImageWithFallback, { url: 'https://example.com/dead.jpg', alt: 'a photo' }));
    const img = container.querySelector('img')!;

    fireEvent.error(img);

    expect(container.querySelector('img')).toBeNull();
    const tile = screen.getByRole('img', { name: 'Image unavailable' });
    expect(tile.getAttribute('data-image-fallback')).toBe('');
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('releases a held photo on the priority-image timeout', async () => {
    vi.useFakeTimers();
    const priority = document.createElement('img');
    priority.setAttribute('fetchpriority', 'high');
    Object.defineProperty(priority, 'complete', { configurable: true, get: () => false });
    document.body.appendChild(priority);
    const { container } = render(createElement(ImageWithFallback, {
      url: 'https://example.com/other.jpg',
      alt: 'other',
      painted: true,
    }));
    const held = container.querySelector('[data-feed-image-held]') as HTMLElement | null;
    expect(held).not.toBeNull();
    expect(held?.style.aspectRatio).toBe(String(FEED_IMAGE_ASPECT_RATIO));
    expect(container.querySelector('img')).toBeNull();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2500);
    });
    expect(decodedSrc(container.querySelector('img'))).toContain('https://example.com/other.jpg');
    expect(container.querySelector('[data-feed-image-held]')).toBeNull();
  });

  it('keeps a 4/3 tile when the proxied image errors', () => {
    const { container } = render(createElement(ImageWithFallback, {
      url: 'https://cdn.discordapp.com/attachments/1/2/missing.png',
      alt: 'a photo',
    }));
    const img = container.querySelector('img');
    expect(decodedSrc(img)).toContain('/api/image-proxy?url=');
    expect(decodedSrc(img)).not.toMatch(/^https?:\/\/cdn\.discordapp\.com/);
    fireEvent.error(img!);
    const tile = screen.getByRole('img', { name: 'Image unavailable' }) as HTMLElement;
    expect(tile.getAttribute('data-image-fallback')).toBe('');
    expect(tile.style.aspectRatio).toBe(String(FEED_IMAGE_ASPECT_RATIO));
    expect(container.querySelector('img')).toBeNull();
  });

  it('shows the tile for a private host without requesting it', () => {
    const { container } = render(createElement(ImageWithFallback, {
      url: 'http://127.0.0.1/secret.jpg',
      alt: 'secret',
    }));
    expect(container.querySelector('img')).toBeNull();
    const tile = screen.getByRole('img', { name: 'Image unavailable' }) as HTMLElement;
    expect(tile.style.aspectRatio).toBe(String(FEED_IMAGE_ASPECT_RATIO));
  });

  it('does not request a non-priority GIF until play', () => {
    const { container } = render(createElement(ImageWithFallback, {
      url: 'https://media.giphy.com/media/abc/giphy.gif',
      alt: 'a gif',
      painted: true,
    }));
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('video')).toBeNull();
    expect(container.innerHTML).not.toContain('giphy.gif');
    const poster = screen.getByRole('button', { name: 'Play media' }) as HTMLElement;
    expect(poster.style.aspectRatio).toBe(String(FEED_IMAGE_ASPECT_RATIO));
    expect(poster.style.width).toBe('100%');
    fireEvent.click(poster);
    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    expect(decodedSrc(img)).toContain('giphy.gif');
    expect(img?.getAttribute('fetchpriority')).not.toBe('high');
  });

  it('does not request a markdown video until play', () => {
    const { container } = render(createElement(ImageWithFallback, {
      url: 'https://cdn.example.com/clip.mp4',
      alt: 'a clip',
      painted: true,
    }));
    expect(container.querySelector('video')).toBeNull();
    expect(container.innerHTML).not.toContain('clip.mp4');
    const poster = screen.getByRole('button', { name: 'Play media' }) as HTMLElement;
    expect(poster.style.aspectRatio).toBe(String(FEED_IMAGE_ASPECT_RATIO));
    fireEvent.click(poster);
    const video = container.querySelector('video');
    expect(video?.getAttribute('src')).toBe('https://cdn.example.com/clip.mp4');
    expect(video?.getAttribute('autoplay')).toBeNull();
    expect(video?.autoplay).toBe(false);
    expect(video?.getAttribute('preload')).toBe('metadata');
  });

  it('still paints a GIF immediately when it is the priority image', () => {
    const { container } = render(createElement(ImageWithFallback, {
      url: 'https://media.giphy.com/media/abc/giphy.gif',
      alt: 'a gif',
      priority: true,
    }));
    expect(container.querySelector('img')).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'Play media' })).toBeNull();
    expect(container.querySelector('img')?.getAttribute('fetchpriority')).toBe('high');
  });

  it('holds an extensionless file the server marked as a GIF', () => {
    const url = 'https://ipfs.3speak.tv/ipfs/QmExample';
    const { container } = render(
      <DeferredMediaUrlProvider urls={[url]}>
        <ImageWithFallback url={url} alt="ipfs" painted />
      </DeferredMediaUrlProvider>,
    );
    expect(container.querySelector('img')).toBeNull();
    expect(container.innerHTML).not.toContain('QmExample');
  });

  it('shows the same tile when the url can never be an image', () => {
    const { container } = render(createElement(ImageWithFallback, { url: 'javascript:alert(1)', alt: 'a photo' }));
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByRole('img', { name: 'Image unavailable' })).toBeTruthy();
    expect(screen.queryByRole('link')).toBeNull();
  });
});
