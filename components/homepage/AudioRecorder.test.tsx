// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { ChakraProvider } from '@chakra-ui/react';

const uploadAudioTo3Speak = vi.fn();
const fetch3SpeakAudioQuota = vi.fn();
vi.mock('@/lib/hive/client-functions', () => ({
  uploadAudioTo3Speak: (...args: unknown[]) => uploadAudioTo3Speak(...args),
  fetch3SpeakAudioQuota: (...args: unknown[]) => fetch3SpeakAudioQuota(...args),
}));

import AudioRecorder from './AudioRecorder';

const LIMIT_429 = {
  code: 'daily_audio_limit',
  kind: 'audio',
  status: 429,
  message: 'Free accounts can upload 2 audio files per 24 hours. Your next audio upload is possible at 2026-11-21T14:32:00Z. 3Speak Pro removes this limit.',
  upgradeUrl: 'https://3speak.tv/wallet/alice#pro',
  limit: 2,
  used: 2,
  nextAt: '2026-11-21T14:32:00Z',
  retryAfterSeconds: 16320,
  maxSeconds: null,
  duration: null,
};

const TOO_LONG_413 = {
  code: 'audio_too_long',
  kind: 'audio',
  status: 413,
  message: 'Free accounts can upload audio up to 15 minutes long. This file is 22 minutes. 3Speak Pro removes this limit.',
  upgradeUrl: 'https://3speak.tv/wallet/alice#pro',
  limit: null,
  used: null,
  nextAt: null,
  retryAfterSeconds: null,
  maxSeconds: 900,
  duration: 1320,
};

function renderRecorder(onAudioRecorded = vi.fn()) {
  render(
    <ChakraProvider>
      <AudioRecorder isOpen onClose={vi.fn()} onAudioRecorded={onAudioRecorded} username="alice" />
    </ChakraProvider>,
  );
  return onAudioRecorded;
}

/** Pick an audio file in the Upload tab; jsdom cannot read its length, so it probes as 0. */
async function pickFile(name = 'episode.mp3') {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  const file = new File(['abc'], name, { type: 'audio/mpeg' });
  fireEvent.change(input, { target: { files: [file] } });
  await screen.findByText(name);
}

describe('AudioRecorder upload limits', () => {
  let srcDescriptor: PropertyDescriptor | undefined;

  beforeEach(() => {
    uploadAudioTo3Speak.mockReset();
    fetch3SpeakAudioQuota.mockReset();
    // jsdom has no media pipeline: make the duration probe fail fast.
    (URL as any).createObjectURL = vi.fn(() => 'blob:test');
    (URL as any).revokeObjectURL = vi.fn();
    srcDescriptor = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'src');
    Object.defineProperty(HTMLMediaElement.prototype, 'src', {
      configurable: true,
      set(this: HTMLMediaElement) { setTimeout(() => this.onerror?.(new Event('error') as any)); },
      get() { return ''; },
    });
  });

  afterEach(() => {
    cleanup();
    if (srcDescriptor) Object.defineProperty(HTMLMediaElement.prototype, 'src', srcDescriptor);
  });

  it('shows the daily limit, links Pro, keeps the file and does not retry', async () => {
    fetch3SpeakAudioQuota.mockResolvedValue(null);
    uploadAudioTo3Speak.mockResolvedValue({ success: false, error: LIMIT_429.message, limit: LIMIT_429 });
    const onAudioRecorded = renderRecorder();

    await pickFile();
    fireEvent.click(screen.getByRole('button', { name: 'Use Audio' }));

    const notice = await screen.findByTestId('upload-limit-notice');
    expect(notice.textContent).toContain('Free accounts can upload 2 audio files per 24 hours.');
    expect(notice.textContent).toContain('3Speak Pro removes this limit.');
    const pro = screen.getByRole('link', { name: 'Get 3Speak Pro' });
    expect(pro.getAttribute('href')).toBe('https://3speak.tv/wallet/alice#pro');
    expect(uploadAudioTo3Speak).toHaveBeenCalledTimes(1);
    expect(onAudioRecorded).not.toHaveBeenCalled();
    // The draft stays: the picked file is still there to try later.
    expect(screen.getByText('episode.mp3')).toBeTruthy();
  });

  it('shows the 413 too-long notice', async () => {
    fetch3SpeakAudioQuota.mockResolvedValue(null);
    uploadAudioTo3Speak.mockResolvedValue({ success: false, error: TOO_LONG_413.message, limit: TOO_LONG_413 });
    renderRecorder();

    await pickFile('long.mp3');
    fireEvent.click(screen.getByRole('button', { name: 'Use Audio' }));

    const notice = await screen.findByTestId('upload-limit-notice');
    expect(notice.textContent).toContain('Free accounts can upload audio up to 15 minutes long.');
    expect(notice.textContent).toContain('22:00');
  });

  it('does not block when the quota read fails', async () => {
    fetch3SpeakAudioQuota.mockRejectedValue(new Error('offline'));
    uploadAudioTo3Speak.mockResolvedValue({ success: true, playUrl: 'https://audio.3speak.tv/play?a=abc' });
    const onAudioRecorded = renderRecorder();

    await waitFor(() => expect(fetch3SpeakAudioQuota).toHaveBeenCalledWith('alice'));
    await pickFile();
    fireEvent.click(screen.getByRole('button', { name: 'Use Audio' }));

    await waitFor(() => expect(onAudioRecorded).toHaveBeenCalledWith('https://audio.3speak.tv/play?a=abc'));
    expect(screen.queryByTestId('upload-limit-notice')).toBeNull();
  });

  it('warns before a file is picked when the day is used up', async () => {
    fetch3SpeakAudioQuota.mockResolvedValue({
      enabled: true,
      exempt: false,
      reason: null,
      audio: { limit: 2, used: 2, remaining: 0, next_at: '2999-01-01T00:00:00Z', max_seconds: 900 },
    });
    renderRecorder();

    const notice = await screen.findByTestId('upload-limit-notice');
    expect(notice.textContent).toContain('2 audio files per 24 hours');
    expect(screen.getByRole('link', { name: 'Get 3Speak Pro' }).getAttribute('href')).toBe('https://3speak.tv/wallet/alice#pro');
    expect(uploadAudioTo3Speak).not.toHaveBeenCalled();
  });

  it('shows no notice for an exempt account with null limits', async () => {
    fetch3SpeakAudioQuota.mockResolvedValue({
      enabled: true,
      exempt: true,
      reason: 'pro',
      audio: { limit: null, used: 5, remaining: null, next_at: null, max_seconds: null },
    });
    renderRecorder();

    await waitFor(() => expect(fetch3SpeakAudioQuota).toHaveBeenCalled());
    expect(screen.queryByTestId('upload-limit-notice')).toBeNull();
    expect(screen.getByText('Max: 5:00')).toBeTruthy();
  });

  it('caps recording at the free-account length and says so', async () => {
    fetch3SpeakAudioQuota.mockResolvedValue({
      enabled: true,
      exempt: false,
      reason: null,
      audio: { limit: 2, used: 0, remaining: 2, next_at: null, max_seconds: 900 },
    });
    render(
      <ChakraProvider>
        <AudioRecorder isOpen onClose={vi.fn()} onAudioRecorded={vi.fn()} username="alice" maxDuration={Infinity} />
      </ChakraProvider>,
    );

    expect(await screen.findByText('Max: 15:00 (free account)')).toBeTruthy();
  });
});
