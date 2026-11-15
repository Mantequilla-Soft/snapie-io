import { describe, expect, it } from 'vitest';
import { IMAGE_PROXY_PATH } from './feedImageSrc';
import { applyPostImageLayout, POST_IMAGE_SIZES, proxySrcWithWidth } from './postImageLayout';

const ORIGINAL = 'https://files.peakd.com/file/a.jpg';
const SRC = `${IMAGE_PROXY_PATH}?url=${encodeURIComponent(ORIGINAL)}`;

describe('applyPostImageLayout', () => {
  it('leaves an image with unknown dimensions untouched (no srcset, no shrink)', () => {
    const tag = `<p><img alt="cat" src="${SRC}"></p>`;
    expect(applyPostImageLayout(tag)).toBe(tag);
    expect(applyPostImageLayout(tag, {})).toBe(tag);
    // A map that does not list this image changes nothing either.
    const other = applyPostImageLayout(tag, { 'https://files.peakd.com/file/other.jpg': { width: 1200, height: 600 } });
    expect(other).toBe(tag);
    expect(other).not.toContain('srcset=');
    expect(other).not.toContain('sizes=');
  });

  it('adds width, height, aspect-ratio, srcset and sizes when dimensions are known', () => {
    const html = applyPostImageLayout(`<img src="${SRC}">`, {
      [ORIGINAL]: { width: 1200, height: 600 },
    });
    expect(html).toContain('width="1200"');
    expect(html).toContain('height="600"');
    expect(html).toContain('aspect-ratio:1200/600');
    expect(html).toContain(`sizes="${POST_IMAGE_SIZES}"`);
    expect(html).toContain('w=320');
    expect(html).toContain('w=960');
    // No 1280w entry when the intrinsic width is 1200; the unresized src is
    // offered at its real width instead.
    expect(html).not.toContain('w=1280');
    expect(html).toContain(`${SRC.replace(/&/g, '&amp;')} 1200w`);
  });

  it('pins a small image to its real width and skips srcset when nothing smaller exists', () => {
    const html = applyPostImageLayout(`<img src="${SRC}">`, {
      [ORIGINAL]: { width: 300, height: 200 },
    });
    expect(html).toContain('width="300"');
    expect(html).not.toContain('srcset=');
  });

  it('does not add srcset when the author already set a width', () => {
    const tag = `<img src="${SRC}" width="400">`;
    expect(applyPostImageLayout(tag, { [ORIGINAL]: { width: 1200, height: 600 } })).toBe(tag);
  });

  it('uses a caller-supplied sizes hint', () => {
    const html = applyPostImageLayout(`<img src="${SRC}">`, { [ORIGINAL]: { width: 1200, height: 600 } }, '50vw');
    expect(html).toContain('sizes="50vw"');
  });

  it('leaves hivemoji and gifs alone', () => {
    const emoji = `<span class="hivemoji"><img class="hivemoji__img" src="${SRC}" style="width:1em;height:1em"></span>`;
    expect(applyPostImageLayout(emoji, { [ORIGINAL]: { width: 64, height: 64 } })).toBe(emoji);

    const gifOriginal = 'https://media.giphy.com/media/abc/giphy.gif';
    const gifSrc = `${IMAGE_PROXY_PATH}?url=${encodeURIComponent(gifOriginal)}`;
    const gif = applyPostImageLayout(`<img src="${gifSrc}">`, { [gifOriginal]: { width: 800, height: 400 } });
    expect(gif).toContain(`src="${gifSrc}"`);
    expect(gif).toContain('width="800"');
    expect(gif).not.toContain('srcset=');
  });

  it('encodes ampersands in srcset and is idempotent', () => {
    const dims = { [ORIGINAL]: { width: 1200, height: 600 } };
    const once = applyPostImageLayout(`<img src="${SRC}">`, dims);
    expect(once).toContain('&amp;w=');
    expect(applyPostImageLayout(once, dims)).toBe(once);
    const withWidth = proxySrcWithWidth(SRC, 640);
    expect(withWidth).toContain('w=640');
    expect(withWidth).toContain(encodeURIComponent(ORIGINAL));
  });
});
