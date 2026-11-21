import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { uploadAudioTo3Speak, fetch3SpeakAudioQuota, fetch3SpeakVideoQuota } from './client-functions';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const blob = new Blob(['audio'], { type: 'audio/webm' });

describe('uploadAudioTo3Speak limits', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_3SPEAK_API_KEY', 'test-key');
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('returns the daily limit with its message and does not retry', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(429, {
      error: 'Daily audio upload limit reached',
      code: 'daily_audio_limit',
      message: 'Free accounts can upload 2 audio files per 24 hours. Your next audio upload is possible at 2026-11-21T14:32:00Z. 3Speak Pro removes this limit.',
      limit: 2,
      used: 2,
      next_at: '2026-11-21T14:32:00Z',
      retry_after_seconds: 16320,
      upgrade_url: 'https://3speak.tv/wallet/alice#pro',
    }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await uploadAudioTo3Speak(blob, 60, 'alice');

    expect(result.success).toBe(false);
    expect(result.limit?.code).toBe('daily_audio_limit');
    expect(result.limit?.upgradeUrl).toBe('https://3speak.tv/wallet/alice#pro');
    expect(result.error).toContain('2 audio files per 24 hours');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('returns a 413 audio_too_long', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(413, {
      error: 'Audio too long',
      code: 'audio_too_long',
      message: 'Free accounts can upload audio up to 15 minutes long. This file is 22 minutes. 3Speak Pro removes this limit.',
      max_seconds: 900,
      duration: 1320,
      upgrade_url: 'https://3speak.tv/wallet/alice#pro',
    })));

    const result = await uploadAudioTo3Speak(blob, 1320, 'alice');

    expect(result.success).toBe(false);
    expect(result.limit?.code).toBe('audio_too_long');
    expect(result.error).toContain('up to 15 minutes');
  });

  it('keeps a plain per-minute 429 (no code) as an ordinary error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(429, { error: 'Too many uploads, slow down' })));

    const result = await uploadAudioTo3Speak(blob, 10, 'alice');

    expect(result.success).toBe(false);
    expect(result.limit).toBeUndefined();
    expect(result.error).toBe('Too many uploads, slow down');
  });

  it('reads the quotas and returns null when they fail', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('offline'); }));
    expect(await fetch3SpeakAudioQuota('alice')).toBeNull();
    expect(await fetch3SpeakVideoQuota('alice')).toBeNull();
  });

  it('skips the quota read without an API key', async () => {
    vi.stubEnv('NEXT_PUBLIC_3SPEAK_API_KEY', '');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect(await fetch3SpeakAudioQuota('alice')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
