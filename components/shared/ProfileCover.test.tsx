// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';
import { ChakraProvider } from '@chakra-ui/react';
import { createElement } from 'react';
import ProfileCover from './ProfileCover';
import { PROFILE_COVER_WIDTH } from '@/lib/images/coverImage';

const DISCORD = 'https://cdn.discordapp.com/attachments/409556855400955909/421701212996370445/Meno_banner_Blue.png';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function renderCover(url: string) {
  return render(
    createElement(
      ChakraProvider,
      null,
      createElement(ProfileCover, {
        url,
        alt: 'meno cover',
        fallback: createElement('div', null, 'default cover'),
      }),
    ),
  );
}

function jsonResponse(body: unknown, ok = true) {
  return {
    ok,
    json: async () => body,
  };
}

describe('ProfileCover', () => {
  it('shows the default background and does not fetch when the cover is missing or unsafe', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { container } = renderCover('');
    expect(screen.getByText('default cover')).toBeTruthy();
    expect(container.querySelector('img')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();

    cleanup();
    renderCover('http://127.0.0.1/secret.jpg');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getAllByText('default cover').length).toBeGreaterThan(0);
  });

  it('does not render an image or the remote host when the cover 404s', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ ok: false }));
    vi.stubGlobal('fetch', fetchMock);
    const { container } = renderCover(DISCORD);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const requested = String(fetchMock.mock.calls[0][0]);
    expect(requested.startsWith('/api/image-proxy?url=')).toBe(true);
    expect(requested).toContain('probe=1');
    expect(requested).toContain(encodeURIComponent(DISCORD));
    expect(requested).not.toMatch(/^https?:\/\//);
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText('default cover')).toBeTruthy();
  });

  it('loads a valid cover from the optimizer at a fixed width', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);
    const { container } = renderCover('https://i.imgur.com/TyZjlBu.jpg');

    await waitFor(() => expect(container.querySelector('img')).not.toBeNull());
    const img = container.querySelector('img')!;
    const src = img.getAttribute('src') ?? '';
    expect(src).toContain('/_next/image?url=');
    expect(decodeURIComponent(src)).toContain('/api/image-proxy?url=');
    expect(src).toContain(`w=${PROFILE_COVER_WIDTH}`);
    expect(src.startsWith('https://i.imgur.com')).toBe(false);
    const srcSet = img.getAttribute('srcset') ?? '';
    expect(srcSet.length).toBeGreaterThan(0);
    for (const part of srcSet.split(',')) {
      expect(part).toContain(`w=${PROFILE_COVER_WIDTH}`);
    }
    expect(img.getAttribute('alt')).toBe('meno cover');
    expect(img.getAttribute('sizes')).toBe(`${PROFILE_COVER_WIDTH}px`);
  });

  it('returns to the default background if the optimized image fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ ok: true })));
    const { container } = renderCover('https://files.peakd.com/file/a.png');
    await waitFor(() => expect(container.querySelector('img')).not.toBeNull());
    fireEvent.error(container.querySelector('img')!);
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText('default cover')).toBeTruthy();
  });
});
