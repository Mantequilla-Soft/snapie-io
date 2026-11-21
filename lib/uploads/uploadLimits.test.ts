import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// The TUS client is never meant to start when the token is refused; the mock
// records every Upload created and lets a test drive its callbacks.
const tusUploads: Array<{ options: Record<string, any>; start: ReturnType<typeof vi.fn> }> = [];
vi.mock('tus-js-client', () => ({
  Upload: class {
    options: Record<string, any>;
    start = vi.fn(() => this.onStart());
    onStart: () => void = () => {};
    constructor(_file: unknown, options: Record<string, any>) {
      this.options = options;
      tusUploads.push(this as any);
    }
  },
}));

import {
  parseUploadLimit,
  readUploadLimit,
  uploadLimitFromTusError,
  formatUploadLimitMessage,
  formatLength,
  fetchVideoQuota,
  fetchAudioQuota,
  blockedByQuota,
  audioMaxSeconds,
  audioTooLong,
  isUploadLimitError,
  UploadLimitError,
} from '@/packages/operations/src/limits';
import { uploadVideoTo3Speak } from '@/packages/operations/src/video';
import { uploadAudioTo3Speak as uploadAudioTus } from '@/packages/operations/src/audio';

const VIDEO_429 = {
  error: 'Daily video upload limit reached',
  code: 'daily_upload_limit',
  kind: 'video',
  limit: 1,
  used: 1,
  next_at: '2026-11-21T14:32:00Z',
  retry_after_seconds: 52320,
  message: 'Free accounts can upload 1 video per 24 hours. Your next video upload is possible at 2026-11-21T14:32:00Z. 3Speak Pro removes this limit.',
  upgrade_url: 'https://3speak.tv/wallet/alice#pro',
};

const AUDIO_429 = {
  error: 'Daily audio upload limit reached',
  code: 'daily_audio_limit',
  message: 'Free accounts can upload 2 audio files per 24 hours. Your next audio upload is possible at 2026-11-21T14:32:00Z. 3Speak Pro removes this limit.',
  limit: 2,
  used: 2,
  next_at: '2026-11-21T14:32:00Z',
  retry_after_seconds: 16320,
  upgrade_url: 'https://3speak.tv/wallet/alice#pro',
};

const AUDIO_413 = {
  error: 'Audio too long',
  code: 'audio_too_long',
  message: 'Free accounts can upload audio up to 15 minutes long. This file is 22 minutes. 3Speak Pro removes this limit.',
  max_seconds: 900,
  duration: 1320,
  upgrade_url: 'https://3speak.tv/wallet/alice#pro',
};

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

const UTC = { locale: 'en-US', timeZone: 'UTC' };

describe('parseUploadLimit', () => {
  it('reads a video 429', () => {
    const info = parseUploadLimit(429, VIDEO_429, '52320')!;
    expect(info.code).toBe('daily_upload_limit');
    expect(info.kind).toBe('video');
    expect(info.limit).toBe(1);
    expect(info.nextAt).toBe('2026-11-21T14:32:00Z');
    expect(info.upgradeUrl).toBe('https://3speak.tv/wallet/alice#pro');
    expect(info.retryAfterSeconds).toBe(52320);
  });

  it('tells shorts apart by kind', () => {
    expect(parseUploadLimit(429, { ...VIDEO_429, kind: 'short' })!.kind).toBe('short');
  });

  it('ignores a plain per-minute 429 with no code', () => {
    expect(parseUploadLimit(429, { error: 'Too many requests' })).toBeNull();
    expect(parseUploadLimit(429, null)).toBeNull();
  });

  it('ignores other statuses even with a limit code', () => {
    expect(parseUploadLimit(500, VIDEO_429)).toBeNull();
  });

  it('reads an audio 413', () => {
    const info = parseUploadLimit(413, AUDIO_413)!;
    expect(info.code).toBe('audio_too_long');
    expect(info.kind).toBe('audio');
    expect(info.maxSeconds).toBe(900);
    expect(info.duration).toBe(1320);
  });

  it('falls back to the Retry-After header', () => {
    const { retry_after_seconds: _drop, ...rest } = AUDIO_429;
    expect(parseUploadLimit(429, rest, '120')!.retryAfterSeconds).toBe(120);
  });

  it('reads a fetch Response without consuming it', async () => {
    const res = jsonResponse(429, AUDIO_429, { 'Retry-After': '16320' });
    const info = await readUploadLimit(res);
    expect(info!.code).toBe('daily_audio_limit');
    expect(await res.json()).toMatchObject({ code: 'daily_audio_limit' });
    expect(await readUploadLimit(new Response('not json', { status: 429 }))).toBeNull();
    expect(await readUploadLimit(jsonResponse(200, {}))).toBeNull();
  });

  it('maps a TUS DetailedError', () => {
    const err = { originalResponse: { getStatus: () => 429, getBody: () => JSON.stringify(VIDEO_429), getHeader: () => '60' } };
    expect(uploadLimitFromTusError(err)!.code).toBe('daily_upload_limit');
    expect(uploadLimitFromTusError({ originalResponse: { getStatus: () => 500, getBody: () => '' } })).toBeNull();
    expect(uploadLimitFromTusError(new Error('network'))).toBeNull();
  });
});

describe('formatUploadLimitMessage', () => {
  it('names the next slot in the viewer time zone', () => {
    const info = parseUploadLimit(429, VIDEO_429)!;
    const text = formatUploadLimitMessage(info, UTC);
    expect(text).toContain('Free accounts can upload 1 video per 24 hours.');
    expect(text).toContain('Nov 21');
    expect(text).toContain('2:32');
    expect(text).not.toContain('2026-11-21T14:32:00Z');
    expect(text).toContain('3Speak Pro removes this limit.');
  });

  it('shifts the time with the zone', () => {
    const info = parseUploadLimit(429, VIDEO_429)!;
    expect(formatUploadLimitMessage(info, { locale: 'en-US', timeZone: 'Asia/Tokyo' })).toContain('11:32');
  });

  it('pluralises shorts and audio files', () => {
    expect(formatUploadLimitMessage(parseUploadLimit(429, { ...VIDEO_429, kind: 'short', limit: 3 })!, UTC))
      .toContain('3 shorts per 24 hours');
    expect(formatUploadLimitMessage(parseUploadLimit(429, AUDIO_429)!, UTC))
      .toContain('2 audio files per 24 hours. Your next audio upload is possible');
  });

  it('falls back to the server message when next_at is missing or bad', () => {
    expect(formatUploadLimitMessage(parseUploadLimit(429, { ...VIDEO_429, next_at: null })!)).toBe(VIDEO_429.message);
    expect(formatUploadLimitMessage(parseUploadLimit(429, { ...VIDEO_429, next_at: 'soon' })!)).toBe(VIDEO_429.message);
  });

  it('describes a too-long file', () => {
    const text = formatUploadLimitMessage(parseUploadLimit(413, AUDIO_413)!);
    expect(text).toBe('Free accounts can upload audio up to 15 minutes long. This file is 22:00 long. 3Speak Pro removes this limit.');
    expect(formatUploadLimitMessage(parseUploadLimit(413, { ...AUDIO_413, max_seconds: undefined })!)).toBe(AUDIO_413.message);
  });

  it('formats lengths like the server', () => {
    expect(formatLength(900)).toBe('15 minutes');
    expect(formatLength(90)).toBe('1 minute 30 seconds');
    expect(formatLength(45)).toBe('45 seconds');
  });

  it('is the message of an UploadLimitError', () => {
    const err = new UploadLimitError(parseUploadLimit(413, AUDIO_413)!);
    expect(isUploadLimitError(err)).toBe(true);
    expect(err.message).toContain('15 minutes');
    expect(isUploadLimitError(new Error('x'))).toBe(false);
    expect(isUploadLimitError({ isUploadLimitError: true, info: {} })).toBe(true);
  });
});

describe('quota endpoints', () => {
  it('reads the video quota with the API key header', async () => {
    const body = { enabled: true, exempt: false, reason: null, video: { limit: 1, used: 1, remaining: 0, next_at: '2999-01-01T00:00:00Z' }, short: { limit: 3, used: 0, remaining: 3, next_at: null } };
    const fetchImpl = vi.fn(async () => jsonResponse(200, body));
    const q = await fetchVideoQuota({ apiKey: 'k', owner: '@Alice', fetchImpl });
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://embed.3speak.tv/uploads/quota?owner=Alice',
      expect.objectContaining({ headers: { 'X-API-Key': 'k' } }),
    );
    expect(blockedByQuota(q, 'video', 'alice')!.limit).toBe(1);
    expect(blockedByQuota(q, 'video', 'alice')!.upgradeUrl).toBe('https://3speak.tv/wallet/alice#pro');
    expect(blockedByQuota(q, 'short', 'alice')).toBeNull();
  });

  it('does not block once next_at has passed', async () => {
    const body = { enabled: true, exempt: false, reason: null, video: { limit: 1, used: 1, remaining: 0, next_at: '2000-01-01T00:00:00Z' }, short: { limit: 3, used: 0, remaining: 3, next_at: null } };
    const q = await fetchVideoQuota({ apiKey: 'k', owner: 'alice', fetchImpl: vi.fn(async () => jsonResponse(200, body)) });
    expect(blockedByQuota(q, 'video', 'alice')).toBeNull();
  });

  it('treats a failed or missing quota as no limit known', async () => {
    expect(await fetchVideoQuota({ apiKey: 'k', owner: 'alice', fetchImpl: vi.fn(async () => { throw new TypeError('offline'); }) })).toBeNull();
    expect(await fetchVideoQuota({ apiKey: 'k', owner: 'alice', fetchImpl: vi.fn(async () => jsonResponse(404, { error: 'Not found' })) })).toBeNull();
    expect(await fetchAudioQuota({ apiKey: 'k', owner: 'alice', fetchImpl: vi.fn(async () => jsonResponse(503, {})) })).toBeNull();
    expect(await fetchAudioQuota({ apiKey: 'k', owner: 'alice', fetchImpl: vi.fn(async () => new Response('<html>', { status: 200 })) })).toBeNull();
    expect(await fetchAudioQuota({ apiKey: '', owner: 'alice', fetchImpl: vi.fn() })).toBeNull();
    expect(blockedByQuota(null, 'audio', 'alice')).toBeNull();
    expect(audioMaxSeconds(null)).toBeNull();
  });

  it('handles the null fields of an exempt or disabled audio quota', async () => {
    const exempt = { enabled: true, exempt: true, reason: 'pro', audio: { limit: null, used: 4, remaining: null, next_at: null, max_seconds: null } };
    const q = await fetchAudioQuota({ apiKey: 'k', owner: 'alice', fetchImpl: vi.fn(async () => jsonResponse(200, exempt)) });
    expect(q).not.toBeNull();
    expect(blockedByQuota(q, 'audio', 'alice')).toBeNull();
    expect(audioMaxSeconds(q)).toBeNull();
    const off = { enabled: false, exempt: true, reason: null, audio: { limit: null, used: 0, remaining: null, next_at: null, max_seconds: null } };
    expect(audioMaxSeconds(off as any)).toBeNull();
  });

  it('sends X-User for the audio quota and reads max_seconds', async () => {
    const body = { enabled: true, exempt: false, reason: null, audio: { limit: 2, used: 2, remaining: 0, next_at: '2999-01-01T00:00:00Z', max_seconds: 900 } };
    const fetchImpl = vi.fn(async () => jsonResponse(200, body));
    const q = await fetchAudioQuota({ apiKey: 'k', owner: 'alice', fetchImpl });
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://audio.3speak.tv/api/audio/quota',
      expect.objectContaining({ headers: { 'X-API-Key': 'k', 'X-User': 'alice' } }),
    );
    expect(audioMaxSeconds(q)).toBe(900);
    expect(blockedByQuota(q, 'audio', 'alice')!.code).toBe('daily_audio_limit');
  });

  it('warns about too-long audio with the server grace second', () => {
    expect(audioTooLong(901, 900, 'alice')).toBeNull();
    expect(audioTooLong(1320, 900, 'alice')!.code).toBe('audio_too_long');
    expect(audioTooLong(5000, null, 'alice')).toBeNull();
  });
});

describe('uploadVideoTo3Speak', () => {
  // Above the in-memory buffer cap, so the browser-only warm-up is skipped.
  const bigFile = { size: 300 * 1024 * 1024, name: 'clip.mp4', type: 'video/mp4' } as File;

  beforeEach(() => {
    tusUploads.length = 0;
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('stops on a 429 from the token route: no TUS upload, no fallback', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(429, VIDEO_429, { 'Retry-After': '52320' }));
    vi.stubGlobal('fetch', fetchMock);
    const onProgress = vi.fn();

    const err = await uploadVideoTo3Speak(bigFile, { apiKey: 'k', owner: 'alice', isShort: false, onProgress }).catch((e) => e);

    expect(isUploadLimitError(err)).toBe(true);
    expect(err.info.code).toBe('daily_upload_limit');
    expect(err.info.upgradeUrl).toBe('https://3speak.tv/wallet/alice#pro');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String((fetchMock.mock.calls[0] as unknown[])[0])).toBe('https://embed.3speak.tv/uploads/token');
    expect(tusUploads).toHaveLength(0);
  });

  it('keeps the old error for other token failures', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('busy', { status: 429, statusText: 'Too Many Requests' })));
    const err = await uploadVideoTo3Speak(bigFile, { apiKey: 'k', owner: 'alice' }).catch((e) => e);
    expect(isUploadLimitError(err)).toBe(false);
    expect(err.message).toContain('Failed to issue upload token: 429');
  });

  it('maps a 429 on the TUS create to an UploadLimitError', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(200, {
      token: 't', upload_url: 'https://embed.3speak.tv/uploads', permlink: 'p', embed_url: 'https://play.3speak.tv/embed?v=alice/p', expires_at: '',
    })));
    const pending = uploadVideoTo3Speak(bigFile, { apiKey: 'k', owner: 'alice' });
    await vi.waitFor(() => expect(tusUploads).toHaveLength(1));
    const short429 = { ...VIDEO_429, kind: 'short', limit: 3, used: 3 };
    tusUploads[0].options.onError({ originalResponse: { getStatus: () => 429, getBody: () => JSON.stringify(short429), getHeader: () => undefined } });
    const err = await pending.catch((e) => e);
    expect(isUploadLimitError(err)).toBe(true);
    expect(err.info.kind).toBe('short');
  });
});

describe('uploadAudioTo3Speak (TUS SDK)', () => {
  beforeEach(() => {
    tusUploads.length = 0;
  });

  it('maps a 413 on the TUS create to an UploadLimitError', async () => {
    const pending = uploadAudioTus(new Blob(['x'], { type: 'audio/webm' }), { apiKey: 'k', owner: 'alice' });
    await vi.waitFor(() => expect(tusUploads).toHaveLength(1));
    tusUploads[0].options.onError({ originalResponse: { getStatus: () => 413, getBody: () => JSON.stringify(AUDIO_413) } });
    const err = await pending.catch((e) => e);
    expect(isUploadLimitError(err)).toBe(true);
    expect(err.info.code).toBe('audio_too_long');
  });
});
