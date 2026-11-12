// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ChakraProvider } from '@chakra-ui/react';
import ImageUploader from './ImageUploader';

describe('ImageUploader', () => {
  it('names the hidden file input instead of relying on a label aria-label', () => {
    render(
      <ChakraProvider>
        <label className="feed-tool-btn">
          <ImageUploader onUpload={vi.fn()} ariaLabel="Image" />
        </label>
      </ChakraProvider>,
    );

    const input = screen.getByLabelText('Image');
    expect(input).toBeTruthy();
    expect(input.getAttribute('type')).toBe('file');
  });
});
