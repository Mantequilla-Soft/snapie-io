import { Box, Image } from "@chakra-ui/react";
import VideoRenderer from "@/components/layout/VideoRenderer";
import { parseMediaContent, MediaItem } from "@/lib/utils/snapUtils";
import DOMPurify from 'isomorphic-dompurify';

interface MediaRendererProps {
  mediaContent: string;
}

/**
 * MediaRenderer handles rendering of media content separately from text
 * This is a key component in SkateHive's architecture for media/text separation
 */
const MediaRenderer = ({ mediaContent }: MediaRendererProps) => {
  const mediaItems = parseMediaContent(mediaContent);

  if (mediaItems.length === 0) {
    return null;
  }

  return (
    <Box mb={4}>
      {mediaItems.map((item: MediaItem, index: number) => {
        // Render videos using VideoRenderer with Intersection Observer
        if (item.type === "video" && item.src) {
          return (
            <Box key={index} mb={2}>
              <VideoRenderer src={item.src} />
            </Box>
          );
        }

        // Render images
        if (item.type === "image") {
          // Extract URL from markdown syntax
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

        // Render iframes (for embeds like YouTube, Odysee, etc.)
        if (item.type === "iframe" && item.src) {
          // Add loading="lazy" to iframe HTML to defer loading until near viewport
          const lazyIframeContent = item.content.replace(
            /<iframe/i,
            '<iframe loading="lazy"'
          );
          
          // Sanitize iframe content to prevent XSS attacks
          const sanitizedIframe = DOMPurify.sanitize(lazyIframeContent, {
            ALLOWED_TAGS: ['iframe'],
            ALLOWED_ATTR: ['src', 'width', 'height', 'frameborder', 'allowfullscreen', 'loading', 'allow', 'title', 'scrolling', 'allowtransparency', 'style'],
            ALLOWED_URI_REGEXP: /^(?:(?:(?:f|ht)tps?):\/\/(?:www\.)?(?:youtube\.com|youtu\.be|youtube-nocookie\.com|odysee\.com|rumble\.com|vimeo\.com|dailymotion\.com|ipfs\.skatehive\.app|ipfs\.io|play\.3speak\.tv|embed\.3speak\.tv|instagram\.com|platform\.twitter\.com|twitter\.com|x\.com))/i,
            ADD_ATTR: ['loading', 'scrolling', 'allowtransparency'],
          });
          
          return (
            <Box 
              key={index} 
              mb={2}
              dangerouslySetInnerHTML={{ __html: sanitizedIframe }}
              sx={{
                iframe: {
                  width: "100%",
                  aspectRatio: "16/9",
                  borderRadius: "md",
                  border: "none",
                  overflow: "hidden",
                },
              }}
            />
          );
        }

        return null;
      })}
    </Box>
  );
};

export default MediaRenderer;
