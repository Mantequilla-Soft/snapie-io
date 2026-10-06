// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { createElement } from 'react';
import MediaRenderer from './MediaRenderer';

afterEach(() => cleanup());

describe('MediaRenderer deferred heavy media', () => {
  it('does not mount a video file or a youtube iframe before play', () => {
    const { container } = render(createElement(MediaRenderer, {
      mediaContent: [
        '![](https://cdn.example.com/clip.mp4)',
        'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      ].join('\n'),
    }));
    expect(container.querySelector('video')).toBeNull();
    expect(container.querySelector('iframe')).toBeNull();
    expect(container.innerHTML).not.toContain('clip.mp4');
    expect(container.innerHTML).not.toContain('youtube-nocookie.com');
    expect(screen.getAllByRole('button', { name: 'Play media' })).toHaveLength(2);
  });
});
