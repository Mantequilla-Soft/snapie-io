import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  extractHangoutUrls,
  extractHivePostUrls,
  extractLastUrl,
  extractYouTubeId,
  fetchSnapieAudioMetadata,
  finalizeAudio3SpeakEmbedUrl,
  getEmbedFallback,
  inferEmbedAspectFromIframeSrc,
  isPrivateNetworkUrl,
  isSnapContainer,
  isWaveContainer,
  parseMediaContent,
  separateContent,
  speakPlaybackUrl,
  speakVideoKeyFromUrl,
} from './snapUtils';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('isPrivateNetworkUrl', () => {
    it('flags RFC1918 private ranges', () => {
        expect(isPrivateNetworkUrl('http://192.168.0.180/photo.jpg')).toBe(true);
        expect(isPrivateNetworkUrl('http://10.0.0.5/photo.jpg')).toBe(true);
        expect(isPrivateNetworkUrl('http://172.16.4.1/photo.jpg')).toBe(true);
        expect(isPrivateNetworkUrl('http://172.31.255.254/photo.jpg')).toBe(true);
    });

    it('does not flag the 172.32.x.x range (outside RFC1918)', () => {
        expect(isPrivateNetworkUrl('http://172.32.0.1/photo.jpg')).toBe(false);
    });

    it('flags loopback and link-local addresses', () => {
        expect(isPrivateNetworkUrl('http://127.0.0.1/x.jpg')).toBe(true);
        expect(isPrivateNetworkUrl('http://localhost/x.jpg')).toBe(true);
        expect(isPrivateNetworkUrl('http://169.254.1.1/x.jpg')).toBe(true);
        expect(isPrivateNetworkUrl('http://[::1]/x.jpg')).toBe(true);
    });

    it('flags mDNS .local hostnames', () => {
        expect(isPrivateNetworkUrl('http://my-nas.local/photo.jpg')).toBe(true);
    });

    it('does not flag ordinary public URLs', () => {
        expect(isPrivateNetworkUrl('https://images.hive.blog/u/meno/avatar/sm')).toBe(false);
        expect(isPrivateNetworkUrl('https://files.peakd.com/file/peakd-hive/x.jpg')).toBe(false);
    });

    it('treats an unparseable URL as not private (leaves it to other validation)', () => {
        expect(isPrivateNetworkUrl('not a url')).toBe(false);
    });
});

describe('parseMediaContent private-network filtering', () => {
    it('drops a markdown image pointing at a private LAN address', () => {
        const items = parseMediaContent('![photo](http://192.168.0.180/wordpress/uploads/x.jpg)');
        expect(items).toHaveLength(0);
    });

    it('keeps a markdown image pointing at a public host', () => {
        const items = parseMediaContent('![photo](https://images.hive.blog/u/meno/avatar/sm)');
        expect(items).toHaveLength(1);
        expect(items[0].type).toBe('image');
    });

    it('drops a raw iframe pointing at a private LAN address', () => {
        const items = parseMediaContent('<iframe src="http://192.168.1.1/admin"></iframe>');
        expect(items).toHaveLength(0);
    });

    it('keeps ipfs images, direct videos, and 3speak audio iframes', () => {
        const hash = 'QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG';
        const ipfsImage = parseMediaContent(`![pic](https://ipfs.io/ipfs/${hash})`);
        expect(ipfsImage[0]).toMatchObject({
            type: 'image',
        });

        const video = parseMediaContent('![clip](https://cdn.example/clip.mp4)');
        expect(video[0]).toMatchObject({ type: 'video', src: 'https://cdn.example/clip.mp4' });

        const ipfsVideo = parseMediaContent(`![clip](ipfs://${hash}/clip.mp4)`);
        expect(ipfsVideo[0]).toMatchObject({ type: 'video' });

        const ipfsStill = parseMediaContent(`![pic](ipfs://${hash}/still.png)`);
        expect(ipfsStill[0]).toMatchObject({ type: 'image' });

        const audio = parseMediaContent('<iframe src="http://audio.3speak.tv/play?a=abc"></iframe>');
        expect(audio[0].type).toBe('iframe');
        expect(audio[0].src).toContain('audio.3speak.tv');
        expect(audio[0].src).toContain('mode=compact');

        const broken = parseMediaContent('<iframe src="http://[play.3speak.tv/embed?v=alice/hi"></iframe>');
        expect(broken[0].src).toContain('noscroll=1');
    });
});

describe('snap and embed helpers', () => {
  it('recognises snap and wave containers', () => {
    expect(isSnapContainer('peak.snaps', 'snaps')).toBe(true);
    expect(isSnapContainer('peak.snaps')).toBe(true);
    expect(isSnapContainer('peak.snaps', 'other')).toBe(false);
    expect(isSnapContainer(null, 'snaps')).toBe(false);
    expect(isWaveContainer('ecency.waves', 'waves-2026-10-06')).toBe(true);
    expect(isWaveContainer('alice')).toBe(false);
  });

  it('normalises 3speak playback, audio embeds, and video keys', () => {
    expect(speakVideoKeyFromUrl('https://play.3speak.tv/embed?v=alice%2Fhello')).toBe('alice/hello');
    expect(speakVideoKeyFromUrl('watch?v=bob%2Fclip')).toBe('bob/clip');
    expect(speakVideoKeyFromUrl('https://example.com/nope')).toBeNull();
    expect(speakPlaybackUrl('https://example.com/a.mp4', true)).toBe('https://example.com/a.mp4');
    const portrait = new URL(speakPlaybackUrl('https://play.3speak.tv/embed?v=alice/hi', true));
    expect(portrait.searchParams.get('layout')).toBe('mobile');
    expect(portrait.searchParams.get('noscroll')).toBe('1');
    expect(new URL(speakPlaybackUrl('https://play.3speak.tv/watch?v=alice/hi', false)).searchParams.get('layout')).toBe('desktop');
    expect(speakPlaybackUrl('http://[', true)).toBe('http://[');
    expect(speakPlaybackUrl('http://[play.3speak.tv', true)).toBe('http://[play.3speak.tv');

    expect(finalizeAudio3SpeakEmbedUrl('https://example.com/a')).toBe('https://example.com/a');
    const audio = new URL(finalizeAudio3SpeakEmbedUrl('http://audio.3speak.tv/play?a=abc'));
    expect(audio.protocol).toBe('https:');
    expect(audio.searchParams.get('mode')).toBe('compact');
    expect(audio.searchParams.get('iframe')).toBe('1');
    expect(finalizeAudio3SpeakEmbedUrl('http://audio.3speak.tv/play?a=abc')).toContain('iframe=1');
    expect(finalizeAudio3SpeakEmbedUrl('audio.3speak.tv/play?a=abc')).toContain('mode=compact');
  });

  it('extracts youtube ids and safe embed fallbacks', () => {
    expect(extractYouTubeId('https://www.youtube.com/watch?v=abcdefghijk')).toBe('abcdefghijk');
    expect(extractYouTubeId('https://youtu.be/abcdefghijk')).toBe('abcdefghijk');
    expect(extractYouTubeId('https://www.youtube.com/shorts/abcdefghijk')).toBe('abcdefghijk');
    expect(extractYouTubeId('https://www.youtube.com/embed/abcdefghijk')).toBe('abcdefghijk');
    expect(extractYouTubeId('https://www.youtube.com/live/abcdefghijk')).toBe('abcdefghijk');
    expect(extractYouTubeId('https://example.com')).toBeNull();

    expect(getEmbedFallback('')).toBeNull();
    expect(getEmbedFallback('https://www.youtube.com/embed/abcdefghijk')).toEqual({
      href: 'https://www.youtube.com/watch?v=abcdefghijk',
      label: 'Open video on YouTube',
    });
    expect(getEmbedFallback('https://www.youtube.com/embed/short')).toBeNull();
    expect(getEmbedFallback('https://play.3speak.tv/embed?v=alice%2Fhi')).toEqual({
      href: 'https://3speak.tv/watch?v=alice/hi',
      label: 'Open video on 3Speak',
    });
    expect(getEmbedFallback('https://play.3speak.tv/embed')).toBeNull();
    expect(getEmbedFallback('play.3speak.tv/embed?v=bob%2Fclip')).toEqual({
      href: 'https://3speak.tv/watch?v=bob/clip',
      label: 'Open video on 3Speak',
    });
    expect(getEmbedFallback('https://embed.reddit.com/r/hive/comments/abc123/?embed=true')).toEqual({
      href: 'https://www.reddit.com/r/hive/comments/abc123/',
      label: 'Open on Reddit',
    });
    expect(getEmbedFallback('https://example.com/embed')).toBeNull();
  });

  it('pulls hive posts, hangouts, and the last previewable url out of a body', () => {
    const body = [
      'See https://hive.blog/hive/@alice/hello-world and https://www.peakd.com/@bob/other',
      'https://hangout.3speak.tv/room/friday',
      'https://example.com/article',
      'https://example.com/photo.jpg',
    ].join('\n');
    expect(extractHivePostUrls(body)).toEqual([
      { url: 'https://hive.blog/hive/@alice/hello-world', author: 'alice', permlink: 'hello-world' },
      { url: 'https://www.peakd.com/@bob/other', author: 'bob', permlink: 'other' },
    ]);
    expect(extractHangoutUrls(body)).toEqual(['friday']);
    expect(extractLastUrl(body)).toBe('https://example.com/article');
    expect(extractLastUrl('no links')).toBeNull();
    expect(inferEmbedAspectFromIframeSrc('https://www.instagram.com/p/abc/embed/')).toBe('4/5');
    expect(inferEmbedAspectFromIframeSrc('https://audio.3speak.tv/play?a=1')).toBeUndefined();
  });

  it('keeps a labeled media link in the text and lifts bare media urls', () => {
    const labeled = 'said at [00:42](https://3speak.tv/watch?v=alice/live) during the stream';
    expect(separateContent(labeled).text).toContain('00:42');
    expect(separateContent(labeled).media).toBe('');
    const bare = separateContent('watch https://www.youtube.com/watch?v=abcdefghijk');
    expect(bare.media).toContain('youtube.com');
    expect(bare.text).toBe('');
  });

  it('turns bare social urls, 3speak, ipfs, and iframes into media items', () => {
    const body = [
      'https://www.youtube.com/shorts/abcdefghijk',
      'https://www.instagram.com/reel/AbCdEf',
      'https://x.com/alice/status/12345',
      'https://www.reddit.com/r/hive/comments/abc123/title',
      'https://3speak.tv/watch?v=alice/legacy',
      'https://play.3speak.tv/watch?v=alice/clip',
      'https://play.3speak.tv/embed?v=alice/embed',
      'https://audio.3speak.tv/play?a=track',
      '![vid](https://ipfs.io/ipfs/bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi/clip.mp4)',
      '![pic](ipfs://QmYwAPJzv5CZsnA625s3Xf2nemtYg82sqS4xP5Qf1)',
      '<iframe src="https://play.3speak.tv/embed?v=alice/frame"></iframe>',
      '<iframe src="https://www.youtube.com/embed/abcdefghijk"></iframe>',
      '<iframe src="https://ipfs.io/ipfs/bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi"></iframe>',
      '<iframe src="https://www.instagram.com/p/abc/embed/"></iframe>',
    ].join('\n');
    const items = parseMediaContent(body);
    expect(items.map((item) => item.type)).toEqual([
      'iframe', 'iframe', 'iframe', 'iframe', 'iframe', 'iframe', 'iframe', 'iframe',
      'video', 'image', 'iframe', 'video', 'iframe',
    ]);
    expect(items[0].embedAspect).toBe('9/16');
    expect(items[8].src).toContain('ipfs.skatehive.app');
    expect(items[10].src).toContain('noscroll=1');
    expect(items[12].embedAspect).toBe('4/5');
  });

  it('resolves 3speak audio metadata by cid, then by the trailing id', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false, json: async () => ({}) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ audioUrl: '', permlink: 'x' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ audioUrl: 'https://cdn/a.mp4', permlink: 'track' }) });
    vi.stubGlobal('fetch', fetchMock);
    const meta = await fetchSnapieAudioMetadata('https://audio.3speak.tv/play?cid=abc&a=alice/track');
    expect(meta?.permlink).toBe('track');
    await expect(fetchSnapieAudioMetadata('not a url')).resolves.toBeNull();
    vi.stubGlobal('fetch', vi.fn());
    await expect(fetchSnapieAudioMetadata('https://audio.3speak.tv/play')).resolves.toBeNull();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }));
    await expect(fetchSnapieAudioMetadata('https://audio.3speak.tv/play?a=missing')).resolves.toBeNull();
  });
});
