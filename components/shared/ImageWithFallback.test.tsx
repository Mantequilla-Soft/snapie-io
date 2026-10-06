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
