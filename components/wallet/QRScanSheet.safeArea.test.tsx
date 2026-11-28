// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { ChakraProvider } from '@chakra-ui/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import QRScanSheet from './QRScanSheet';

beforeEach(() => {
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: {
      getUserMedia: vi.fn(async () => ({
        getTracks: () => [],
      })),
    },
  });
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
});

afterEach(cleanup);

describe('QRScanSheet safe-area (#258)', () => {
  it('keeps the close control clear of the notch', () => {
    render(
      <ChakraProvider>
        <QRScanSheet isOpen onClose={() => {}} onScan={() => {}} />
      </ChakraProvider>,
    );

    expect(screen.getByRole('button', { name: 'Close scanner' })).toBeTruthy();
    const css = [...document.querySelectorAll('style')].map((node) => node.textContent || '').join('\n');
    expect(css).toMatch(/max\([^)]*safe-area-inset-top/);
    expect(css).toMatch(/max\([^)]*safe-area-inset-right/);
  });
});
