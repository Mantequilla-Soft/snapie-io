// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { ChakraProvider } from '@chakra-ui/react';
import { createElement, type ReactNode } from 'react';
import MediaRenderer from './MediaRenderer';

const mediaPause = HTMLMediaElement.prototype.pause;
const mediaPlay = HTMLMediaElement.prototype.play;

afterEach(() => {
  cleanup();
  HTMLMediaElement.prototype.pause = mediaPause;
  HTMLMediaElement.prototype.play = mediaPlay;
  vi.unstubAllGlobals();
});

function renderMedia(node: ReactNode) {
  return render(createElement(ChakraProvider, null, node));
}

describe('MediaRenderer deferred heavy media', () => {
  it('shows a poster and does not autoplay a video or mount a youtube iframe before play', async () => {
    vi.stubGlobal('IntersectionObserver', class {
      observe() {}
      disconnect() {}
      unobserve() {}
    });
    HTMLMediaElement.prototype.pause = () => undefined;
    HTMLMediaElement.prototype.play = () => Promise.resolve();
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener() {},
      removeListener() {},
      addEventListener() {},
      removeEventListener() {},
      dispatchEvent() { return false; },
    }));
    const { container } = renderMedia(createElement(MediaRenderer, {
      mediaContent: [
        '![](https://cdn.example.com/clip.mp4)',
        'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      ].join('\n'),
    }));
    expect(container.querySelector('video')).toBeNull();
    expect(container.querySelector('iframe')).toBeNull();
    expect(container.innerHTML).not.toContain('clip.mp4');
    expect(container.innerHTML).not.toContain('youtube-nocookie.com');
    const posters = screen.getAllByRole('button', { name: 'Play media' }) as HTMLElement[];
    expect(posters).toHaveLength(2);
    posters.forEach((poster) => {
      expect(poster.style.aspectRatio).toBe(String(16 / 9));
      expect(poster.style.width).toBe('100%');
    });

    fireEvent.click(posters[0]);
    await waitFor(() => {
      expect(container.querySelector('video')).not.toBeNull();
    });
    const video = container.querySelector('video');
    expect(video?.getAttribute('src')).toBe('https://cdn.example.com/clip.mp4');
    expect(video?.autoplay).toBe(false);
    expect(video?.getAttribute('autoplay')).toBeNull();
    expect(container.querySelector('iframe')).toBeNull();
    expect(container.innerHTML).not.toContain('youtube-nocookie.com');
  });
});
