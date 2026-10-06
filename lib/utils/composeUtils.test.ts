import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  compressImage,
  extractImageUrls,
  generatePermlink,
  insertAtCursor,
  prepareImageArray,
  validateContent,
  validateTitle,
} from './composeUtils';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('composer text helpers', () => {
  it('builds a hive permlink from a title, and a timestamp when the title is empty', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-06T12:00:00Z'));
    expect(generatePermlink('  ')).toBe(`post-${Date.now()}`);
    expect(generatePermlink('Hello, Hive_World!!')).toBe(`hello-hive-world-${String(Date.now()).slice(-6)}`);
    const stamp = String(Date.now()).slice(-6);
    expect(generatePermlink('a'.repeat(300))).toBe(`${'a'.repeat(249)}-${stamp}`);
  });

  it('collects markdown and html images and can pin a thumbnail', () => {
    const markdown = '![a](https://cdn.example/a.jpg)\n<img src="https://cdn.example/b.png">';
    expect(extractImageUrls(markdown)).toEqual([
      'https://cdn.example/a.jpg',
      'https://cdn.example/b.png',
    ]);
    expect(prepareImageArray(markdown)).toEqual([
      'https://cdn.example/a.jpg',
      'https://cdn.example/b.png',
    ]);
    expect(prepareImageArray(markdown, 'https://cdn.example/cover.jpg')[0]).toBe('https://cdn.example/cover.jpg');
    expect(prepareImageArray(markdown, 'https://cdn.example/a.jpg')[0]).toBe('https://cdn.example/a.jpg');
  });

  it('inserts text at the textarea selection', () => {
    vi.useFakeTimers();
    const textarea = {
      selectionStart: 5,
      selectionEnd: 5,
      focus: vi.fn(),
      setSelectionRange: vi.fn(),
    } as unknown as HTMLTextAreaElement;
    const writes: string[] = [];
    insertAtCursor(textarea, ' world', 'hello', (value) => writes.push(value));
    expect(writes).toEqual(['hello world']);
    vi.runAllTimers();
    expect(textarea.focus).toHaveBeenCalled();
    expect(textarea.setSelectionRange).toHaveBeenCalledWith(11, 11);
  });

  it('rejects empty, short, and oversized titles and bodies', () => {
    expect(validateTitle('  ')).toEqual({ valid: false, error: 'Title is required' });
    expect(validateTitle('ab')).toEqual({ valid: false, error: 'Title must be at least 3 characters' });
    expect(validateTitle('a'.repeat(256)).valid).toBe(false);
    expect(validateTitle('Hello').valid).toBe(true);

    expect(validateContent('   ')).toEqual({ valid: false, error: 'Post content is required' });
    expect(validateContent('too short').valid).toBe(false);
    expect(validateContent('a'.repeat(70000)).valid).toBe(false);
    expect(validateContent('a real post body').valid).toBe(true);
  });
});

describe('compressImage', () => {
  it('returns an animated GIF unchanged instead of re-encoding it', async () => {
    const gif = new File([new Uint8Array([0x47, 0x49, 0x46])], 'loop.gif', { type: 'image/gif' });
    const result = await compressImage(gif);
    expect(result).toBe(gif);
    expect(result.type).toBe('image/gif');
  });

  it('downscales a wide raster image and reports the smaller file', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    class FakeReader {
      onload: ((event: { target: { result: string } }) => void) | null = null;
      onerror: (() => void) | null = null;
      readAsDataURL() {
        queueMicrotask(() => this.onload?.({ target: { result: 'data:image/png;base64,xx' } }));
      }
    }
    class FakeImage {
      width = 3840;
      height = 2160;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_value: string) {
        queueMicrotask(() => this.onload?.());
      }
    }
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => ({ drawImage: vi.fn() }),
      toBlob: (callback: (blob: Blob | null) => void) => {
        callback(new Blob([new Uint8Array([1, 2])], { type: 'image/jpeg' }));
      },
    };
    vi.stubGlobal('FileReader', FakeReader);
    vi.stubGlobal('Image', FakeImage);
    vi.stubGlobal('document', { createElement: () => canvas });

    const source = new File([new Uint8Array(2048)], 'wide.png', { type: 'image/png' });
    const compressed = await compressImage(source, 1920, 0.8);
    expect(compressed).not.toBe(source);
    expect(compressed.type).toBe('image/jpeg');
    expect(compressed.name).toBe('wide.png');
    expect(canvas.width).toBe(1920);
    expect(canvas.height).toBe(1080);
    expect(log).toHaveBeenCalled();
  });

  it('rejects when the file, the bitmap, the canvas, or the blob cannot be used', async () => {
    class FailingReader {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      readAsDataURL() {
        queueMicrotask(() => this.onerror?.());
      }
    }
    vi.stubGlobal('FileReader', FailingReader);
    const source = new File([new Uint8Array([1])], 'wide.png', { type: 'image/png' });
    await expect(compressImage(source)).rejects.toThrow('Failed to read file');

    class Reader {
      onload: ((event: { target: { result: string } }) => void) | null = null;
      onerror: (() => void) | null = null;
      readAsDataURL() {
        queueMicrotask(() => this.onload?.({ target: { result: 'data:image/png;base64,xx' } }));
      }
    }
    class BrokenImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_value: string) {
        queueMicrotask(() => this.onerror?.());
      }
    }
    vi.stubGlobal('FileReader', Reader);
    vi.stubGlobal('Image', BrokenImage);
    await expect(compressImage(source)).rejects.toThrow('Failed to load image');

    class WideImage {
      width = 800;
      height = 600;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_value: string) {
        queueMicrotask(() => this.onload?.());
      }
    }
    vi.stubGlobal('Image', WideImage);
    vi.stubGlobal('document', {
      createElement: () => ({
        width: 0,
        height: 0,
        getContext: () => null,
        toBlob: () => {},
      }),
    });
    await expect(compressImage(source)).rejects.toThrow('Failed to get canvas context');

    vi.stubGlobal('document', {
      createElement: () => ({
        width: 0,
        height: 0,
        getContext: () => ({ drawImage: vi.fn() }),
        toBlob: (callback: (blob: Blob | null) => void) => callback(null),
      }),
    });
    await expect(compressImage(source)).rejects.toThrow('Failed to compress image');
  });
});
