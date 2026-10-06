// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { createElement } from 'react';
import ImageWithFallback from './ImageWithFallback';

afterEach(() => cleanup());

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
    expect(img?.getAttribute('fetchpriority')).not.toBe('low');
    expect(screen.queryByText('Image failed to load.')).toBeNull();
  });

  it('does not eager-load a GIF, even when asked to prioritize it', () => {
    const { container } = render(createElement(ImageWithFallback, {
      url: 'https://media.giphy.com/media/abc/giphy.gif',
      alt: 'a gif',
      priority: true,
    }));
    const img = container.querySelector('img');
    expect(img?.getAttribute('loading')).toBe('lazy');
    expect(img?.getAttribute('fetchpriority')).toBe('low');
    expect(decodedSrc(img)).toContain('giphy.gif');
  });

  it('marks only a chosen photo as the high-priority image', () => {
    const { container } = render(createElement(ImageWithFallback, {
      url: 'https://images.hive.blog/photo.webp',
      alt: 'a photo',
      priority: true,
    }));
    const img = container.querySelector('img');
    expect(img?.getAttribute('loading')).toBe('eager');
    expect(img?.getAttribute('fetchpriority')).toBe('high');
  });

  it('defers a photo the size probe rejected', () => {
    const { container } = render(createElement(ImageWithFallback, {
      url: 'https://images.hive.blog/huge.jpg',
      alt: 'a large photo',
      priority: true,
      defer: true,
    }));
    const img = container.querySelector('img');
    expect(img?.getAttribute('loading')).toBe('lazy');
    expect(img?.getAttribute('fetchpriority')).toBe('low');
  });

  it('optimizes a same-origin path directly instead of proxying it', () => {
    const { container } = render(createElement(ImageWithFallback, { url: '/logo.png', alt: 'logo' }));
    const src = decodedSrc(container.querySelector('img'));
    expect(src).toContain('/logo.png');
    expect(src).not.toContain('/api/image-proxy');
  });

  it('shows a visible fallback with a working link once the image fails to load, instead of vanishing', () => {
    const { container } = render(createElement(ImageWithFallback, { url: 'https://example.com/dead.jpg', alt: 'a photo' }));
    const img = container.querySelector('img')!;

    fireEvent.error(img);

    expect(container.querySelector('img')).toBeNull(); // no longer just a hidden broken <img>
    expect(screen.getByText('Image failed to load.')).toBeTruthy();
    const link = screen.getByText('Open image directly') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('https://example.com/dead.jpg');
  });

  it('does not render a javascript: link when the url can never be an image', () => {
    const { container } = render(createElement(ImageWithFallback, { url: 'javascript:alert(1)', alt: 'a photo' }));
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText('Image failed to load.')).toBeTruthy();
    expect(screen.queryByText('Open image directly')).toBeNull();
  });
});
