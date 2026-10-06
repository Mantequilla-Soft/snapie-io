import { Box, Image, IconButton } from "@chakra-ui/react";
import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { createPortal } from "react-dom";
import { FiX } from "react-icons/fi";
import ImageCarousel from "@/components/shared/ImageCarousel";
import ImageWithFallback from "@/components/shared/ImageWithFallback";
import {
  parseMediaContent,
  MediaItem,
  speakVideoKeyFromUrl,
  finalizeAudio3SpeakEmbedUrl,
} from "@/lib/utils/snapUtils";
import { resolveFeedImageSrc } from "@/lib/images/feedImageSrc";
import { classifyFeedMediaUrl, deferredEmbedAspect, isDeferredVideoEmbed } from "@/lib/images/feedLcp";
import { DeferredMediaGate } from "@/components/shared/DeferredFeedMedia";

const VideoRenderer = dynamic(() => import("@/components/layout/VideoRenderer"), { ssr: false });
const SnapieSpeakAudio = dynamic(() => import("@/components/shared/SnapieSpeakAudio"), { ssr: false });
const TwitterEmbed = dynamic(() => import("@/components/shared/TwitterEmbed"), { ssr: false });
const ThreeSpeakVideoPlayer = dynamic(() => import("@/components/shared/ThreeSpeakVideoPlayer"), { ssr: false });
const IframeEmbedBox = dynamic(() => import("@/components/shared/IframeEmbedBox"), { ssr: false });

interface MediaRendererProps {
  mediaContent: string;
  /** Preload the first plain image. Home feed only, for the LCP card. */
  priority?: boolean;
  /** When set, only this URL gets fetchpriority=high. GIF and video stay off it. */
  priorityUrl?: string;
  /** First-viewport images paint without a fade. Priority still means preload. */
  painted?: boolean;
  /** Render markdown images only. The home LCP card uses this so an embed
   *  iframe is not a second early document on the critical path. */
  onlyImages?: boolean;
  /** Skip markdown images. Paired with onlyImages when a card has both. */
  skipImages?: boolean;
}

// Module-scope caches, deliberately outside React state: SnapList's Virtuoso
// virtualization unmounts a card every time it leaves the scroll window, so
// per-component state for "this 3Speak video turned out to be vertical" and
// "this player already reported ready" was being rediscovered from scratch on
// every re-entry. The vertical rediscovery is the worse of the two — the card
// mounts 16/9, the player loads, and only then flips to 3/4, a ~250px height
// change landing seconds after mount, which shoves the scroll position around
// mid-doomscroll every single time the card scrolls back in. Caching for the
// session means only the very first sighting of a given video can shift
// layout; every remount after that starts at its final size immediately.
const knownVerticalSpeakKeys = new Set<string>();

type RenderGroup =
  | { kind: 'single-image'; url: string }
  | { kind: 'carousel'; urls: string[] }
  | { kind: 'media'; item: MediaItem };

const MediaRenderer = ({ mediaContent, priority = false, priorityUrl, painted = false, onlyImages = false, skipImages = false }: MediaRendererProps) => {
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
  /** 3Speak `v=` keys (owner/permlink) known to be portrait — stable across
   *  layout= URL changes. Seeded from the module-scope session cache so a
   *  virtualization remount renders already-detected videos at their final
   *  3/4 size immediately instead of mounting 16/9 and flipping later. */
  const [verticalSpeakKeys, setVerticalSpeakKeys] = useState<Set<string>>(() => new Set(knownVerticalSpeakKeys));
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
            // Switching 16/9 to 3/4 grows and narrows the box. Doing that
            // to a player at or above the viewport moves the feed. Only
            // adopt the portrait box while the player is still below the
            // fold; this instance stays 16/9 if the message arrives late.
            const rect = iframe.getBoundingClientRect();
            if (rect.top < window.innerHeight) break;
            knownVerticalSpeakKeys.add(key);
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

  const priorityIndex = priority
    ? groupedItems.findIndex((group) => {
        const url = group.kind === 'single-image' ? group.url : group.kind === 'carousel' ? group.urls[0] : '';
        if (!url) return false;
        if (priorityUrl) return url === priorityUrl;
        const kind = classifyFeedMediaUrl(url);
        return kind !== 'gif' && kind !== 'video';
      })
    : -1;

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
            src={resolveFeedImageSrc(lightboxUrl)?.src ?? ''}
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
        const isImage = group.kind === 'single-image' || group.kind === 'carousel';
        if (onlyImages && !isImage) return null;
        if (skipImages && isImage) return null;
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
              <ImageWithFallback url={group.url} alt="Post media" priority={index === priorityIndex} painted={painted} />
            </Box>
          );
        }

        if (group.kind === 'carousel') {
          return (
            <Box key={index} maxW="540px" mx="auto">
              <ImageCarousel urls={group.urls} onImageClick={setLightboxUrl} priority={index === priorityIndex} painted={painted} />
            </Box>
          );
        }

        // kind === 'media'
        const item = group.item;

        if (item.type === "video" && item.src) {
          return (
            <Box key={index} mb={2}>
              <DeferredMediaGate defer aspectRatio={deferredEmbedAspect(item.src)}>
                <VideoRenderer src={item.src} />
              </DeferredMediaGate>
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
              return (
                <DeferredMediaGate key={key} defer aspectRatio={deferredEmbedAspect(item.src)}>
                  <ThreeSpeakVideoPlayer author={author} permlink={permlink} />
                </DeferredMediaGate>
              );
            }
          }

          const speakKey = speakVideoKeyFromUrl(item.src);
          const isVertical3Speak = Boolean(
            speakKey && item.src.includes("play.3speak.tv") && verticalSpeakKeys.has(speakKey)
          );

          if (item.src && isDeferredVideoEmbed(item.src)) {
            return (
              <DeferredMediaGate
                key={item.src ?? `iframe-${index}`}
                defer
                aspectRatio={deferredEmbedAspect(item.src)}
              >
                <IframeEmbedBox item={item} isVertical3Speak={isVertical3Speak} />
              </DeferredMediaGate>
            );
          }

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
