import { Box, Image } from "@chakra-ui/react";
import { useEffect, useMemo, useRef, useState, memo } from "react";
import VideoRenderer from "@/components/layout/VideoRenderer";
import {
  parseMediaContent,
  MediaItem,
  type EmbedAspect,
  speakPlaybackUrl,
  speakVideoKeyFromUrl,
  finalizeAudio3SpeakEmbedUrl,
} from "@/lib/utils/snapUtils";
import SnapieSpeakAudio from "@/components/shared/SnapieSpeakAudio";
import TwitterEmbed from "@/components/shared/TwitterEmbed";
import DOMPurify from "isomorphic-dompurify";

interface MediaRendererProps {
  mediaContent: string;
}

/** Isolated + memoized so parent re-renders do not rewrite iframe innerHTML and reload 3Speak. */
const IframeEmbedBox = memo(function IframeEmbedBox({
  item,
  isVertical3Speak,
}: {
  item: MediaItem;
  isVertical3Speak: boolean;
}) {
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
        /^(?:(?:(?:f|ht)tps?):\/\/(?:www\.)?(?:youtube\.com|youtu\.be|youtube-nocookie\.com|odysee\.com|rumble\.com|vimeo\.com|dailymotion\.com|ipfs\.skatehive\.app|ipfs\.io|play\.3speak\.tv|embed\.3speak\.tv|audio\.3speak\.tv|instagram\.com|platform\.twitter\.com|twitter\.com|x\.com))/i,
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
        : "100%";
  const centerEmbed =
    boxAspect === "9/16" ||
    boxAspect === "3/4" ||
    boxAspect === "4/5";

  return (
    <Box
      mb={2}
      position="relative"
      aspectRatio={boxAspect}
      maxW={maxW}
      mx={centerEmbed ? "auto" : undefined}
      dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
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
    />
  );
}, (prev, next) => {
  return (
    prev.item.src === next.item.src &&
    prev.item.content === next.item.content &&
    prev.item.embedAspect === next.item.embedAspect &&
    prev.isVertical3Speak === next.isVertical3Speak
  );
});

const MediaRenderer = ({ mediaContent }: MediaRendererProps) => {
  const mediaItems = useMemo(
    () => parseMediaContent(mediaContent),
    [mediaContent]
  );
  const wrapperRef = useRef<HTMLDivElement>(null);
  /** 3Speak `v=` keys (owner/permlink) known to be portrait — stable across layout= URL changes. */
  const [verticalSpeakKeys, setVerticalSpeakKeys] = useState<Set<string>>(new Set());

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
      {mediaItems.map((item: MediaItem, index: number) => {
        if (item.type === "video" && item.src) {
          return (
            <Box key={index} mb={2}>
              <VideoRenderer src={item.src} />
            </Box>
          );
        }

        if (item.type === "image") {
          const urlMatch = item.content.match(/!\[.*?\]\((.*?)\)/);
          const imageUrl = urlMatch ? urlMatch[1] : null;

          if (imageUrl) {
            return (
              <Box key={index} mb={2}>
                <Image
                  src={imageUrl}
                  alt="Post media"
                  width="100%"
                  maxWidth="540px"
                  height="auto"
                  objectFit="contain"
                  borderRadius="md"
                  loading="lazy"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                  }}
                />
              </Box>
            );
          }
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
