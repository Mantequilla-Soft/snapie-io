'use client';

import { Box, Link, Text } from '@chakra-ui/react';
import { useEffect, useMemo, useState, memo } from 'react';
import DOMPurify from 'isomorphic-dompurify';
import {
  type EmbedAspect,
  type MediaItem,
  getEmbedFallback,
  speakPlaybackUrl,
} from '@/lib/utils/snapUtils';

/**
 * DOMPurify does not validate CSS property values. Strip position/z-index
 * so an iframe style cannot cover the page. The renderer package has its
 * own hook for markdown; this one covers embed iframes only, and it loads
 * with the embed chunk rather than the first-screen photo.
 */
DOMPurify.addHook('uponSanitizeAttribute', (_node, data) => {
  if (data.attrName === 'style' && data.attrValue) {
    data.attrValue = data.attrValue
      .split(';')
      .filter((decl) => !/^\s*(position|z-index)\s*:/i.test(decl))
      .join(';');
  }
});

const knownReadySpeakSrcs = new Set<string>();
const EMBED_READY_TIMEOUT_MS = 4000;

const IframeEmbedBox = memo(function IframeEmbedBox({
  item,
  isVertical3Speak,
}: {
  item: MediaItem;
  isVertical3Speak: boolean;
}) {
  const [embedBlocked, setEmbedBlocked] = useState(false);
  const fallback = useMemo(
    () => (item.src ? getEmbedFallback(item.src) : null),
    [item.src]
  );
  const is3SpeakIframe = Boolean(item.src?.includes('play.3speak.tv'));

  useEffect(() => {
    setEmbedBlocked(false);
    if (!fallback) return;

    let ready = Boolean(item.src && knownReadySpeakSrcs.has(item.src));

    const markReady = () => {
      ready = true;
      if (item.src) knownReadySpeakSrcs.add(item.src);
      setEmbedBlocked(false);
    };

    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === '3speak-player-ready') {
        markReady();
      }
    };

    if (is3SpeakIframe) {
      window.addEventListener('message', onMessage);
    }

    const timer = window.setTimeout(() => {
      if (!ready && is3SpeakIframe) {
        setEmbedBlocked(true);
      }
    }, EMBED_READY_TIMEOUT_MS);

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('message', onMessage);
    };
  }, [item.src, item.content, fallback, is3SpeakIframe]);

  const sanitizedHtml = useMemo(() => {
    let iframeMarkup = item.content.replace(/<iframe/i, '<iframe loading="lazy"');
    if (item.src?.includes('play.3speak.tv')) {
      const playbackSrc = speakPlaybackUrl(item.src, isVertical3Speak);
      iframeMarkup = iframeMarkup.replace(
        /(\ssrc=)(["'])([^"']*)\2/i,
        (_m, prefix: string, q: string) => `${prefix}${q}${playbackSrc}${q}`
      );
    }
    return DOMPurify.sanitize(iframeMarkup, {
      ALLOWED_TAGS: ['iframe', 'div'],
      ALLOWED_ATTR: [
        'src',
        'width',
        'height',
        'frameborder',
        'allowfullscreen',
        'loading',
        'allow',
        'title',
        'scrolling',
        'allowtransparency',
        'style',
      ],
      ALLOWED_URI_REGEXP:
        /^(?:(?:(?:f|ht)tps?):\/\/(?:www\.)?(?:youtube\.com|youtu\.be|youtube-nocookie\.com|odysee\.com|rumble\.com|vimeo\.com|dailymotion\.com|ipfs\.skatehive\.app|ipfs\.io|play\.3speak\.tv|embed\.3speak\.tv|audio\.3speak\.tv|instagram\.com|platform\.twitter\.com|twitter\.com|x\.com|embed\.reddit\.com))/i,
      ADD_ATTR: ['loading', 'scrolling', 'allowtransparency'],
    });
  }, [item.content, item.src, isVertical3Speak]);

  const boxAspect: EmbedAspect | null = isVertical3Speak
    ? '3/4'
    : item.embedAspect ?? '16/9';
  const maxW =
    boxAspect === '9/16' || boxAspect === '3/4'
      ? 'min(420px, 100%)'
      : boxAspect === '4/5'
        ? '540px'
        : { base: '100%', md: '640px', lg: '800px' };

  return (
    <Box
      mb={2}
      position="relative"
      aspectRatio={boxAspect}
      maxW={maxW}
      mx="auto"
      sx={{
        iframe: {
          width: '100%',
          bg: 'transparent',
          position: 'absolute',
          top: '0',
          left: '0',
          height: '100%',
          borderRadius: 'md',
          border: 'none',
          overflow: 'hidden',
        },
      }}
    >
      <Box dangerouslySetInnerHTML={{ __html: sanitizedHtml }} />
      {fallback && (
        <Box
          position="absolute"
          bottom={2}
          right={2}
          bg="blackAlpha.700"
          px={2}
          py={1}
          borderRadius="sm"
          zIndex={1}
        >
          <Link
            href={fallback.href}
            isExternal
            fontSize="xs"
            color="blue.200"
            textDecoration="underline"
            fontWeight="semibold"
          >
            {fallback.label}
          </Link>
        </Box>
      )}
      {embedBlocked && fallback && (
        <Box
          position="absolute"
          inset={0}
          bg="blackAlpha.700"
          display="flex"
          flexDirection="column"
          alignItems="center"
          justifyContent="center"
          px={4}
          textAlign="center"
          gap={2}
          zIndex={2}
        >
          <Text fontSize="sm" color="whiteAlpha.900">
            This browser blocked the embedded player.
          </Text>
          <Link href={fallback.href} isExternal color="blue.200" textDecoration="underline" fontWeight="semibold">
            {fallback.label}
          </Link>
        </Box>
      )}
    </Box>
  );
}, (prev, next) => {
  return (
    prev.item.src === next.item.src &&
    prev.item.content === next.item.content &&
    prev.item.embedAspect === next.item.embedAspect &&
    prev.isVertical3Speak === next.isVertical3Speak
  );
});

export default IframeEmbedBox;
