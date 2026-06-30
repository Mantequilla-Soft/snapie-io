import { describe, it, expect } from 'vitest';
import {
  extractVideoPermlink,
  isFilenameTitle,
  firstBodyLine,
  pickTitle,
  pickThumbnail,
} from './shortMeta';

// Fixtures captured live during diagnosis (Jun 2026).

// wendyth16 snap — the previously-blank case: empty image[] and empty title in
// Hive metadata; the 3speak video permlink differs from the hive permlink.
const WENDY_META = {
  app: 'snapie-mobile',
  tags: ['hive-178315', 'snaps'],
  image: [],
  video: { platform: '3speak', url: 'https://play.3speak.tv/embed?v=wendyth16/3cb3gaih' },
};
const WENDY_POST = {
  title: '',
  body: 'Golden sunset. #hSnaps #nature\nhttps://play.3speak.tv/embed?v=wendyth16/3cb3gaih',
};

// tibfox — Hive metadata has an image but no title.
const TIBFOX_META = {
  app: '3speak/0.4.0',
  image: ['https://images.3speak.tv/images/1782417736950-5c6294985dc412de.webp'],
  video: { platform: '3speak', url: 'https://play.3speak.tv/embed?v=tibfox/2q5zt768' },
};

describe('extractVideoPermlink', () => {
  it('pulls the 3speak video permlink from video.url (differs from hive permlink)', () => {
    expect(extractVideoPermlink(WENDY_META, 'snap-1782692085491')).toBe('3cb3gaih');
    expect(extractVideoPermlink(TIBFOX_META, 'another-short-vlog-about-ou-721')).toBe('2q5zt768');
  });

  it('falls back to the hive permlink when no video.url is present', () => {
    expect(extractVideoPermlink({}, 'legacy-permlink')).toBe('legacy-permlink');
    expect(extractVideoPermlink({ video: {} }, 'legacy-permlink')).toBe('legacy-permlink');
    expect(extractVideoPermlink(null, 'legacy-permlink')).toBe('legacy-permlink');
  });

  it('handles a malformed video.url by falling back', () => {
    expect(extractVideoPermlink({ video: { url: 'https://play.3speak.tv/embed' } }, 'fb')).toBe('fb');
  });
});

describe('isFilenameTitle', () => {
  it('detects raw upload filenames', () => {
    expect(isFilenameTitle('1001745075.mp4')).toBe(true);
    expect(isFilenameTitle('clip.MOV')).toBe(true);
    expect(isFilenameTitle('video.webm')).toBe(true);
  });
  it('accepts real titles', () => {
    expect(isFilenameTitle('Golden sunset')).toBe(false);
    expect(isFilenameTitle('')).toBe(false);
    expect(isFilenameTitle(null)).toBe(false);
  });
});

describe('firstBodyLine', () => {
  it('returns the first meaningful line, stripped of urls/markdown', () => {
    expect(firstBodyLine(WENDY_POST.body)).toBe('Golden sunset.');
  });
  it('skips bare-url / image-only lines', () => {
    expect(firstBodyLine('https://x.y/z\n\n![](https://img)\nReal text here')).toBe('Real text here');
  });
  it('returns empty for empty/whitespace bodies', () => {
    expect(firstBodyLine('')).toBe('');
    expect(firstBodyLine('   \n  ')).toBe('');
  });
});

describe('pickTitle', () => {
  it('prefers the post title when present', () => {
    expect(pickTitle({ title: 'Concert in the city', body: 'x' }, 'ignored.mp4')).toBe('Concert in the city');
  });
  it('falls back to the first body line when the post title is empty (the snap case)', () => {
    expect(pickTitle(WENDY_POST, '1001745075.mp4')).toBe('Golden sunset.');
  });
  it('uses the watch title only when it is not a filename', () => {
    expect(pickTitle({ title: '', body: '' }, 'A nice clip')).toBe('A nice clip');
    expect(pickTitle({ title: '', body: '' }, '1001745075.mp4')).toBe('');
  });
});

describe('pickThumbnail', () => {
  it('prefers the watch thumbnail', () => {
    expect(pickThumbnail('https://watch/thumb.jpg', 'https://json/img.webp')).toBe('https://watch/thumb.jpg');
  });
  it('falls back to json_metadata image when watch thumbnail is missing', () => {
    expect(pickThumbnail('', TIBFOX_META.image[0])).toBe(TIBFOX_META.image[0]);
    expect(pickThumbnail(null, TIBFOX_META.image[0])).toBe(TIBFOX_META.image[0]);
  });
  it('returns empty when neither source has a thumbnail', () => {
    expect(pickThumbnail('', '')).toBe('');
    expect(pickThumbnail(null, undefined)).toBe('');
  });
});
