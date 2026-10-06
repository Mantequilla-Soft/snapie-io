'use client';

import { Box } from '@chakra-ui/react';
import NextImage from 'next/image';
import { useState } from 'react';
import { resolveFeedImageSrc } from '@/lib/images/feedImageSrc';

interface ProxiedImageProps {
  url: string;
  alt: string;
  /** Display slot passed to the optimizer. */
  sizes?: string;
  objectFit?: 'cover' | 'contain';
  onError?: () => void;
}

/**
 * Remote (or same-origin) image via `next/image`. Remote URLs are rewritten
 * to `/api/image-proxy` first. The parent supplies the box (`position:
 * relative` and a size). A failed load is an empty tile in that box.
 */
export default function ProxiedImage({
  url,
  alt,
  sizes = '540px',
  objectFit = 'cover',
  onError,
}: ProxiedImageProps) {
  const resolved = resolveFeedImageSrc(url);
  const [failed, setFailed] = useState(false);

  if (!resolved || failed) {
    return <Box position="absolute" inset={0} bg="whiteAlpha.200" data-image-fallback="" />;
  }

  return (
    <NextImage
      src={resolved.src}
      alt={alt}
      fill
      sizes={sizes}
      unoptimized={resolved.unoptimized}
      style={{ objectFit }}
      onError={() => {
        setFailed(true);
        onError?.();
      }}
    />
  );
}
