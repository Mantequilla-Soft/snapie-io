import { Box, Image, Link, Text, IconButton } from "@chakra-ui/react";
import { useEffect, useMemo, useRef, useState, memo } from "react";
import { createPortal } from "react-dom";
import { FiX } from "react-icons/fi";
import ImageCarousel from "@/components/shared/ImageCarousel";
import VideoRenderer from "@/components/layout/VideoRenderer";
import {
  parseMediaContent,
  MediaItem,
  type EmbedAspect,
  speakPlaybackUrl,
  speakVideoKeyFromUrl,
  finalizeAudio3SpeakEmbedUrl,
  getEmbedFallback,
} from "@/lib/utils/snapUtils";
import SnapieSpeakAudio from "@/components/shared/SnapieSpeakAudio";
import TwitterEmbed from "@/components/shared/TwitterEmbed";
import ThreeSpeakVideoPlayer from "@/components/shared/ThreeSpeakVideoPlayer";
import DOMPurify from "isomorphic-dompurify";

interface MediaRendererProps {
  mediaContent: string;
}

/** Isolated + memoized so parent re-renders do not rewrite iframe innerHTML and reload 3Speak. */
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
  const is3SpeakIframe = Boolean(item.src?.includes("play.3speak.tv"));

  // Brave/CSP blocks often never fire iframe error events; use a readiness timeout for 3Speak
  // and always show an external link when we have one (YouTube / 3Speak).
  useEffect(() => {
    setEmbedBlocked(false);
    if (!fallback) return;

    let ready = false;

    const markReady = () => {
      ready = true;
      setEmbedBlocked(false);
    };

    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === "3speak-player-ready") {
        markReady();
      }
    };

    if (is3SpeakIframe) {
      window.addEventListener("message", onMessage);
    }

    const timer = window.setTimeout(() => {
      if (!ready && is3SpeakIframe) {
        setEmbedBlocked(true);
      }
    }, EMBED_READY_TIMEOUT_MS);

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("message", onMessage);
    };
  }, [item.src, item.content, fallback, is3SpeakIframe]);

  const sanitizedHtml = useMemo(() => {
    let iframeMarkup = item.content.replace(/<iframe/i, '<iframe loading="lazy"');
    if (item.src?.includes("play.3speak.tv")) {
      const playbackSrc = speakPlaybackUrl(item.src, isVertical3Speak);
      iframeMarkup = iframeMarkup.replace(
        /(\ssrc=)(["'])([^"']*)\2/i,
        (_m, prefix: string, q: string) => `${prefix}${q}${playbackSrc}${q}`
      );
    }
    return DOMPurify.sanitize(iframeMarkup, {
      ALLOWED_TAGS: ["iframe", "div"],
      ALLOWED_ATTR: [
        "src",
        "width",
        "height",
        "frameborder",
        "allowfullscreen",
        "loading",
        "allow",
        "title",
        "scrolling",
        "allowtransparency",
        "style",
      ],
      ALLOWED_URI_REGEXP:
        /^(?:(?:(?:f|ht)tps?):\/\/(?:www\.)?(?:youtube\.com|youtu\.be|youtube-nocookie\.com|odysee\.com|rumble\.com|vimeo\.com|dailymotion\.com|ipfs\.skatehive\.app|ipfs\.io|play\.3speak\.tv|embed\.3speak\.tv|audio\.3speak\.tv|instagram\.com|platform\.twitter\.com|twitter\.com|x\.com|embed\.reddit\.com))/i,
      ADD_ATTR: ["loading", "scrolling", "allowtransparency"],
    });
  }, [item.content, item.src, isVertical3Speak]);

  const boxAspect: EmbedAspect | null = isVertical3Speak
    ? "3/4"
    : item.embedAspect ?? "16/9";
  const maxW =
    boxAspect === "9/16" || boxAspect === "3/4"
      ? "min(420px, 100%)"
      : boxAspect === "4/5"
        ? "540px"
        : { base: "100%", md: "640px", lg: "800px" };

  return (
    <Box
      mb={2}
      position="relative"
      aspectRatio={boxAspect}
      maxW={maxW}
      mx="auto"
      sx={{
        iframe: {
          width: "100%",
          bg: "transparent",
          position: "absolute",
          top: "0",
          left: "0",
          height: "100%",
          borderRadius: "md",
          border: "none",
          overflow: "hidden",
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

type RenderGroup =
  | { kind: 'single-image'; url: string }
  | { kind: 'carousel'; urls: string[] }
  | { kind: 'media'; item: MediaItem };

const MediaRenderer = ({ mediaContent }: MediaRendererProps) => {
  const mediaItems = useMemo(
    () => parseMediaContent(mediaContent),
    [mediaContent]
  );

  const groupedItems = useMemo((): RenderGroup[] => {
    const result: RenderGroup[] = [];
    let i = 0;
    while (i < mediaItems.length) {
      if (mediaItems[i].type === 'image') {
        const urls: string[] = [];
        while (i < mediaItems.length && mediaItems[i].type === 'image') {
          const m = mediaItems[i].content.match(/!\[.*?\]\((.*?)\)/);
          if (m?.[1]) urls.push(m[1]);
          i++;
        }
        if (urls.length === 1) result.push({ kind: 'single-image', url: urls[0] });
        else if (urls.length > 1) result.push({ kind: 'carousel', urls });
      } else {
        result.push({ kind: 'media', item: mediaItems[i] });
        i++;
      }
    }
    return result;
  }, [mediaItems]);

  const wrapperRef = useRef<HTMLDivElement>(null);
  /** 3Speak `v=` keys (owner/permlink) known to be portrait — stable across layout= URL changes. */
  const [verticalSpeakKeys, setVerticalSpeakKeys] = useState<Set<string>>(new Set());
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!lightboxUrl) return;
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setLightboxUrl(null); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [lightboxUrl]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (!event.data || event.data.type !== '3speak-player-ready') return;
      if (!event.data.isVertical) return;
      if (!wrapperRef.current) return;

      const iframes = wrapperRef.current.querySelectorAll<HTMLIFrameElement>('iframe');
      for (const iframe of iframes) {
        if (iframe.contentWindow === event.source) {
          const rawSrc = iframe.getAttribute('src');
          const key = rawSrc ? speakVideoKeyFromUrl(rawSrc) : null;
          if (key) {
            setVerticalSpeakKeys((prev) => {
              if (prev.has(key)) return prev;
              const next = new Set(prev);
              next.add(key);
              return next;
            });
          }
          break;
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  if (mediaItems.length === 0) {
    return null;
  }

  return (
    <Box mb={4} ref={wrapperRef} data-snapie-media-layout>
      {lightboxUrl && typeof document !== 'undefined' && createPortal(
        <Box
          position="fixed"
          inset={0}
          zIndex={9999}
          bg="blackAlpha.900"
          display="flex"
          alignItems="center"
          justifyContent="center"
          onClick={() => setLightboxUrl(null)}
          cursor="zoom-out"
        >
          <IconButton
            aria-label="Close image"
            icon={<FiX />}
            position="fixed"
            top={4}
            right={4}
            zIndex={10000}
            size="md"
            borderRadius="full"
            bg="blackAlpha.700"
            color="white"
            _hover={{ bg: 'blackAlpha.900' }}
            onClick={() => setLightboxUrl(null)}
          />
          <Image
            src={lightboxUrl}
            alt="Full size image"
            maxH="90vh"
            maxW="90vw"
            objectFit="contain"
            borderRadius="md"
            cursor="default"
            onClick={(e) => e.stopPropagation()}
          />
        </Box>,
        document.body
      )}
      {groupedItems.map((group, index) => {
        if (group.kind === 'single-image') {
          return (
            <Box
              key={index}
              mb={2}
              maxW="540px"
              mx="auto"
              borderRadius="md"
              overflow="hidden"
              cursor="zoom-in"
              onClick={() => setLightboxUrl(group.url)}
            >
              <Image
                src={group.url}
                alt="Post media"
                width="100%"
                maxH="480px"
                objectFit="cover"
                display="block"
                loading="lazy"
                onError={(e) => { e.currentTarget.style.display = 'none'; }}
              />
            </Box>
          );
        }

        if (group.kind === 'carousel') {
          return (
            <Box key={index} maxW="540px" mx="auto">
              <ImageCarousel urls={group.urls} onImageClick={setLightboxUrl} />
            </Box>
          );
        }

        // kind === 'media'
        const item = group.item;

        if (item.type === "video" && item.src) {
          return (
            <Box key={index} mb={2}>
              <VideoRenderer src={item.src} />
            </Box>
          );
        }

        if (item.type === "iframe" && item.src) {
          if (item.src.includes("audio.3speak.tv")) {
            return (
              <SnapieSpeakAudio
                key={item.src ?? `audio-${index}`}
                playUrl={finalizeAudio3SpeakEmbedUrl(item.src)}
              />
            );
          }

          if (item.src.includes("platform.twitter.com")) {
            const idMatch = item.src.match(/[?&]id=(\d+)/i);
            if (idMatch) {
              return <TwitterEmbed key={`twitter-${idMatch[1]}`} tweetId={idMatch[1]} />;
            }
          }

          if (item.src.includes("play.3speak.tv")) {
            const key = speakVideoKeyFromUrl(item.src);
            if (key) {
              const [author, permlink] = key.split("/");
              return <ThreeSpeakVideoPlayer key={key} author={author} permlink={permlink} />;
            }
          }

          const speakKey = speakVideoKeyFromUrl(item.src);
          const isVertical3Speak = Boolean(
            speakKey && item.src.includes("play.3speak.tv") && verticalSpeakKeys.has(speakKey)
          );

          return (
            <IframeEmbedBox
              key={item.src ?? `iframe-${index}`}
              item={item}
              isVertical3Speak={isVertical3Speak}
            />
          );
        }

        return null;
      })}
    </Box>
  );
};

export default MediaRenderer;
