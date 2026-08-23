'use client';
import { Box, Image, Link, Text } from '@chakra-ui/react';
import { memo, useState } from 'react';

interface ImageWithFallbackProps {
  url: string;
  alt: string;
}

/**
 * A failed image load (dead link, expired CDN URL, or a browser/ad-blocker
 * silently refusing the request — e.g. Twitter's "amplify_video_thumb"
 * thumbnails commonly get filtered by ad-blocklists since they're part of
 * Twitter's ad product) used to just vanish: onError set display:none with
 * no fallback UI at all, so there was no way to tell a broken image from a
 * post that never had one. Same "give the user a way to open it directly"
 * pattern MediaRenderer's IframeEmbedBox already uses for blocked embeds,
 * applied to plain images. Shared by MediaRenderer (single image) and
 * ImageCarousel (multiple images) so both fail the same way.
 */
const ImageWithFallback = memo(function ImageWithFallback({ url, alt }: ImageWithFallbackProps) {
  const [hasError, setHasError] = useState(false);

  if (hasError) {
    return (
      <Box
        h="200px"
        bg="blackAlpha.700"
        display="flex"
        flexDirection="column"
        alignItems="center"
        justifyContent="center"
        px={4}
        textAlign="center"
        gap={2}
      >
        <Text fontSize="sm" color="whiteAlpha.900">
          Image failed to load.
        </Text>
        <Link
          href={url}
          isExternal
          color="blue.200"
          textDecoration="underline"
          fontWeight="semibold"
          fontSize="sm"
          onClick={(e) => e.stopPropagation()}
        >
          Open image directly
        </Link>
      </Box>
    );
  }

  return (
    <Image
      src={url}
      alt={alt}
      width="100%"
      maxH="480px"
      objectFit="cover"
      display="block"
      loading="lazy"
      onError={() => setHasError(true)}
    />
  );
});

export default ImageWithFallback;
