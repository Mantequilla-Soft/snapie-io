import { describe, expect, it } from 'vitest';
import { IMAGE_PROXY_PATH } from './feedImageSrc';
import { applyPostImageLayout, POST_IMAGE_SIZES, POST_IMAGE_SRCSET_WIDTHS, proxySrcWithWidth } from './postImageLayout';

const ORIGINAL = 'https://files.peakd.com/file/a.jpg';
const SRC = `${IMAGE_PROXY_PATH}?url=${encodeURIComponent(ORIGINAL)}`;

describe('applyPostImageLayout', () => {
  it('adds srcset and sizes to a proxied content image without dimensions', () => {
    const html = applyPostImageLayout(`<p><img alt="cat" src="${SRC}"></p>`);
    expect(html).toContain(`src="${SRC}"`);
    expect(html).toContain(`sizes="${POST_IMAGE_SIZES}"`);
    for (const width of POST_IMAGE_SRCSET_WIDTHS) {
      expect(html).toContain(`w=${width}`);
      expect(html).toContain(`${width}w`);
    }
    expect(html).not.toContain('width="');
    expect(html).not.toContain('height="');
  });

  it('adds width, height, and aspect-ratio when dimensions are known', () => {
    const html = applyPostImageLayout(`<img src="${SRC}">`, {
      [ORIGINAL]: { width: 1200, height: 600 },
    });
    expect(html).toContain('width="1200"');
    expect(html).toContain('height="600"');
    expect(html).toContain('aspect-ratio:1200/600');
    // No 1280w entry when the intrinsic width is 1200.
    expect(html).not.toContain('w=1280');
    expect(html).toContain('w=960');
  });

  it('leaves hivemoji and gifs alone, and still renders if dimensions are missing', () => {
    const emoji = `<span class="hivemoji"><img class="hivemoji__img" src="${SRC}" style="width:1em;height:1em"></span>`;
    expect(applyPostImageLayout(emoji, { [ORIGINAL]: { width: 64, height: 64 } })).toBe(emoji);

    const gifSrc = `${IMAGE_PROXY_PATH}?url=${encodeURIComponent('https://media.giphy.com/media/abc/giphy.gif')}`;
    const gif = applyPostImageLayout(`<img src="${gifSrc}">`);
    expect(gif).toContain(`src="${gifSrc}"`);
    expect(gif).not.toContain('srcset=');

    const unknown = applyPostImageLayout('<img src="/badges/excited.png">');
    expect(unknown).toContain('src="/badges/excited.png"');
    expect(unknown).not.toContain('srcset=');
  });

  it('encodes ampersands in srcset and does not wrap a proxy src twice', () => {
    const once = applyPostImageLayout(`<img src="${SRC}">`);
    expect(once).toContain('&amp;w=');
    expect(applyPostImageLayout(once)).toBe(once);
    const withWidth = proxySrcWithWidth(SRC, 640);
    expect(withWidth).toContain('w=640');
    expect(withWidth).toContain(encodeURIComponent(ORIGINAL));
  });
});
