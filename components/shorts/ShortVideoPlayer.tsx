'use client';

import { usePlayer } from '@mantequilla-soft/3speak-player/react';
import { useCallback, useEffect, useRef } from 'react';

export default function ShortVideoPlayer({
  author,
  permlink,
  autoPlay,
  muted,
}: {
  author: string;
  permlink: string;
  autoPlay: boolean;
  muted: boolean;
}) {
  const localRef = useRef<HTMLVideoElement | null>(null);
  const { ref: playerCallbackRef } = usePlayer({
    apiBase: 'https://play.3speak.tv',
    autoLoad: `${author}/${permlink}`,
    autoPlay,
    muted: true,
    poster: false,
    hlsConfig: {
      maxBufferLength: 30,
      maxMaxBufferLength: 60,
      maxBufferSize: 30 * 1000 * 1000,
    },
  });

  const combinedRef = useCallback(
    (el: HTMLVideoElement | null) => {
      localRef.current = el;
      playerCallbackRef(el);
    },
    [playerCallbackRef],
  );

  useEffect(() => {
    const el = localRef.current;
    if (!el) return;
    if (autoPlay) {
      el.play().catch(() => {});
    } else {
      el.pause();
    }
  }, [autoPlay]);

  // React's `muted` JSX prop is broken — mutate the DOM element directly.
  useEffect(() => {
    if (localRef.current) localRef.current.muted = muted;
  }, [muted]);

  return (
    <video
      ref={combinedRef}
      autoPlay={autoPlay}
      playsInline
      muted
      loop={autoPlay}
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        objectFit: 'cover',
        background: '#000',
        opacity: autoPlay ? 1 : 0,
        pointerEvents: autoPlay ? 'auto' : 'none',
      }}
    />
  );
}
