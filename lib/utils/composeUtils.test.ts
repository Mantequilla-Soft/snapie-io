import { describe, it, expect } from 'vitest';
import { compressImage } from './composeUtils';

describe('compressImage', () => {
  it('returns an animated GIF unchanged instead of re-encoding it', async () => {
    const gif = new File([new Uint8Array([0x47, 0x49, 0x46])], 'loop.gif', { type: 'image/gif' });
    const result = await compressImage(gif);
    expect(result).toBe(gif);
    expect(result.type).toBe('image/gif');
  });
});
