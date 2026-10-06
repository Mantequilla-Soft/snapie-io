// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, waitFor, act } from '@testing-library/react';
import { ChakraProvider } from '@chakra-ui/react';
import { createElement } from 'react';
import { Avatar } from './Avatar';

const requested: string[] = [];

afterEach(() => {
  cleanup();
  requested.length = 0;
  vi.unstubAllGlobals();
});

function stubImage() {
  vi.stubGlobal('Image', class {
    set src(value: string) {
      requested.push(value);
    }
    get src() {
      return '';
    }
    set onload(_: unknown) {}
    set onerror(_: unknown) {}
    set crossOrigin(_: string) {}
  });
}

function renderAvatar() {
  return render(
    createElement(ChakraProvider, null, createElement(Avatar, { username: 'alice' })),
  );
}

describe('Avatar', () => {
  it('does not request an avatar while the priority image is still loading', async () => {
    stubImage();
    const priority = document.createElement('img');
    priority.setAttribute('fetchpriority', 'high');
    Object.defineProperty(priority, 'complete', { configurable: true, get: () => false });
    document.body.appendChild(priority);
    try {
      renderAvatar();
      await act(async () => {
        await Promise.resolve();
      });
      expect(requested).toEqual([]);
      priority.dispatchEvent(new Event('load'));
      await waitFor(() => {
        expect(requested.some((url) => url.includes('images.hive.blog/u/alice/avatar'))).toBe(true);
      });
    } finally {
      priority.remove();
    }
  });

  it('requests the avatar when the page has no priority image', async () => {
    stubImage();
    renderAvatar();
    await waitFor(() => {
      expect(requested.some((url) => url.includes('images.hive.blog/u/alice/avatar'))).toBe(true);
    });
  });
});
