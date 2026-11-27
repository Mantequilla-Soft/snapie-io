'use client';

import { Box } from '@chakra-ui/react';
import NextImage from 'next/image';
import { ReactNode, useEffect, useState } from 'react';
import { coverProbePath, PROFILE_COVER_WIDTH, profileCoverLoaderSrc, resolveCoverImageSrc } from '@/lib/images/coverImage';

const coverLoader = ({ src }: { src: string }) => profileCoverLoaderSrc(src);

interface ProfileCoverProps {
  url: string;
  alt: string;
  /** Shown when the cover is missing, blocked, or not an image. The slot stays 200px. */
  fallback: ReactNode;
  /**
   * Paint the image on the first render. The profile banner is the LCP
   * element, and waiting for the probe kept it lazy for about two seconds.
   * A failed load still falls back. Other callers keep the probe-first path
   * so a 404 never becomes an img.
   */
  priority?: boolean;
}

/**
 * Profile and wallet banner. The browser only requests this origin: a JSON
 * preflight, then (if the upstream image exists) `next/image` at a fixed
 * width. A 404 never becomes an `<img>`, so it does not log a console error
 * or carry a third-party cookie.
 */
export default function ProfileCover({ url, alt, fallback, priority = false }: ProfileCoverProps) {
  const proxySrc = resolveCoverImageSrc(url);
  const [phase, setPhase] = useState<'pending' | 'ready' | 'fallback'>(
    !proxySrc ? 'fallback' : priority ? 'ready' : 'pending',
  );

  useEffect(() => {
    if (!proxySrc) {
      setPhase('fallback');
      return;
    }

    const ac = new AbortController();
    let cancelled = false;
    setPhase(priority ? 'ready' : 'pending');

    fetch(coverProbePath(proxySrc), {
      signal: ac.signal,
      headers: { Accept: 'application/json' },
    })
      .then(async (res) => {
        if (!res.ok) return false;
        const body = await res.json().catch(() => null);
        return body?.ok === true;
      })
      .then((ok) => {
        if (!cancelled) setPhase(ok ? 'ready' : 'fallback');
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setPhase('fallback');
      });

    return () => {
      cancelled = true;
      ac.abort();
    };
  }, [proxySrc, priority]);

  return (
    <Box position="relative" width="100%" height="100%">
      <Box position="absolute" inset={0}>
        {fallback}
      </Box>
      {phase === 'ready' && proxySrc && (
        <NextImage
          src={proxySrc}
          alt={alt}
          fill
          priority={priority}
          sizes={priority ? '(max-width: 48em) 100vw, 1200px' : `${PROFILE_COVER_WIDTH}px`}
          loader={coverLoader}
          style={{ objectFit: 'cover' }}
          onError={() => setPhase('fallback')}
        />
      )}
    </Box>
  );
}
