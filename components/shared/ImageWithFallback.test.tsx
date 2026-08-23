// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { createElement } from 'react';
import ImageWithFallback from './ImageWithFallback';

// Regression test: a failed image (dead link, expired CDN URL, or a
// browser/ad-blocker silently refusing the request) used to just vanish —
// onError set display:none with zero fallback UI, so a broken image and a
// post that never had one looked identical. Confirmed live with a real
// ad-blocked Twitter thumbnail URL before this fix existed.

describe('ImageWithFallback', () => {
  it('renders the image normally before any error', () => {
    const { container } = render(createElement(ImageWithFallback, { url: 'https://example.com/pic.jpg', alt: 'a photo' }));
    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    expect(img?.getAttribute('src')).toBe('https://example.com/pic.jpg');
    expect(screen.queryByText('Image failed to load.')).toBeNull();
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
});
