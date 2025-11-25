import { Discussion } from "@hiveio/dhive";

export interface MediaItem {
  type: "image" | "video" | "iframe";
  content: string;
  src?: string;
}

/**
 * Add noscroll parameter to 3Speak URLs to prevent scrollbars in iframe
 */
function fix3SpeakUrl(url: string): string {
  if (!url.includes('play.3speak.tv/embed')) return url;
  
  try {
    const urlObj = new URL(url);
    urlObj.searchParams.set('noscroll', '1');
    return urlObj.toString();
  } catch {
    return url + (url.includes('?') ? '&' : '?') + 'noscroll=1';
  }
}

/**
 * Extract YouTube video ID from various YouTube URL formats
 */
function extractYouTubeId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/
  ];
  
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }
  
  return null;
}

/**
 * Check if YouTube URL is a Short (vertical video)
 */
function isYouTubeShort(url: string): boolean {
  return url.includes('/shorts/');
}

/**
 * Extract Instagram post ID from various Instagram URL formats
 */
function extractInstagramId(url: string): string | null {
  const patterns = [
    /instagram\.com\/p\/([A-Za-z0-9_-]+)/,
    /instagram\.com\/reel\/([A-Za-z0-9_-]+)/,
    /instagram\.com\/tv\/([A-Za-z0-9_-]+)/
  ];
  
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }
  
  return null;
}

/**
 * Extract Twitter/X tweet ID from various URL formats
 */
function extractTwitterId(url: string): string | null {
  const patterns = [
    /(?:twitter\.com|x\.com)\/[^/]+\/status\/(\d+)/,
  ];
  
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }
  
  return null;
}

/**
 * Separate content into media and text parts
 * This is the foundation of SkateHive's media/text separation pattern
 */
export const separateContent = (body: string) => {
  // Don't remove URLs - let them be rendered as clickable links
  const textParts: string[] = [];
  const mediaParts: string[] = [];
  const lines = body.split("\n");
  
  lines.forEach((line: string) => {
    // Check if line contains markdown image, iframe, 3Speak embed URL, YouTube URL, Instagram URL, or Twitter/X URL
    if (line.match(/!\[.*?\]\(.*\)/) || 
        line.match(/<iframe.*<\/iframe>/) ||
        line.match(/https?:\/\/play\.3speak\.tv\/embed\?v=/) ||
        line.match(/https?:\/\/(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)/) ||
        line.match(/https?:\/\/(www\.)?instagram\.com\/(p|reel|tv)\//) ||
        line.match(/https?:\/\/(twitter\.com|x\.com)\/[^/]+\/status\/\d+/)) {
      mediaParts.push(line);
    } else {
      textParts.push(line);
    }
  });
  return { text: textParts.join("\n"), media: mediaParts.join("\n") };
};

/**
 * Remove the last URL from content if it's at the end
 * This prevents duplicate rendering of OpenGraph previews
 */
const removeLastUrlFromContent = (content: string): string => {
  const lastUrl = extractLastUrl(content);
  
  if (!lastUrl) {
    return content;
  }
  
  // Find the position of the last URL
  const urlPosition = content.lastIndexOf(lastUrl);
  const afterUrl = content.substring(urlPosition + lastUrl.length).trim();
  
  // Only remove if it's at the end with minimal trailing content
  if (afterUrl === '' || afterUrl.match(/^[\s\n.!?]*$/)) {
    return content.substring(0, urlPosition).trim();
  }
  
  return content;
};

/**
 * Extract Hive post URLs from content and return author/permlink pairs
 */
export const extractHivePostUrls = (content: string): Array<{ url: string; author: string; permlink: string }> => {
  const hiveFrontends = [
    'peakd.com',
    'ecency.com',
    'hive.blog',
    'hiveblog.io',
    'leofinance.io',
    '3speak.tv',
    'd.tube',
    'esteem.app',
    'busy.org'
  ];
  
  const results: Array<{ url: string; author: string; permlink: string }> = [];
  
  // Create pattern for all frontends
  const frontendsPattern = hiveFrontends.map(domain => domain.replace('.', '\\.')).join('|');
  
  // Match Hive post URLs: https://frontend.com/category/@author/permlink or https://frontend.com/@author/permlink
  const hiveUrlRegex = new RegExp(
    `https?:\\/\\/(${frontendsPattern})\\/((?:[^/\\s]+\\/)?@([a-z0-9.-]+)\\/([a-z0-9-]+))`,
    'gi'
  );
  
  let match;
  while ((match = hiveUrlRegex.exec(content)) !== null) {
    const url = match[0];
    const author = match[3];
    const permlink = match[4];
    
    results.push({ url, author, permlink });
  }
  
  return results;
};

/**
 * Extract the last URL from content for OpenGraph preview
 */
export const extractLastUrl = (content: string): string | null => {
  const urlRegex = /https?:\/\/[^\s<>"'`]+/g;
  const urls: string[] = [];
  let match;
  
  while ((match = urlRegex.exec(content)) !== null) {
    let url = match[0];
    // Remove trailing ) if present (from markdown syntax)
    url = url.replace(/\)+$/, '');
    
    // Skip if it's already handled by other systems
    if (
      // Skip image URLs
      url.match(/\.(jpg|jpeg|png|gif|webp|svg|bmp)$/i) ||
      // Skip video URLs
      url.match(/\.(mp4|webm|mov|avi|wmv|flv|mkv)$/i) ||
      // Skip YouTube URLs (handled by markdown processor)
      url.includes('youtube.com') ||
      url.includes('youtu.be') ||
      // Skip 3speak URLs
      url.includes('3speak.tv') ||
      // Skip Vimeo URLs
      url.includes('vimeo.com') ||
      // Skip Odysee URLs
      url.includes('odysee.com') ||
      // Skip IPFS URLs (handled as media)
      url.includes('/ipfs/') ||
      // Skip Instagram URLs (handled by markdown processor)
      url.includes('instagram.com')
    ) {
      continue;
    }
    
    urls.push(url);
  }
  
  return urls.length > 0 ? urls[urls.length - 1] : null;
};

/**
 * Check if a URL is a video file based on extension
 */
const isVideoUrl = (url: string): boolean => {
  const videoExtensions = ['.mp4', '.webm', '.mov', '.avi', '.wmv', '.flv', '.mkv', '.m4v'];
  const lowercaseUrl = url.toLowerCase();
  return videoExtensions.some(ext => lowercaseUrl.includes(ext));
};

/**
 * Detect IPFS URLs from various gateways
 */
const isIpfsUrl = (url: string): boolean => {
  return (
    url.includes('/ipfs/') || 
    url.includes('ipfs.') ||
    url.includes('.ipfs.') ||
    url.startsWith('ipfs://')
  );
};

/**
 * Convert any IPFS gateway URL to skatehive gateway for consistency
 */
const convertToSkatehiveGateway = (url: string): string => {
  // Extract IPFS hash (bafy... or Qm...)
  const ipfsHashMatch = url.match(/(bafy[0-9a-z]{50,}|Qm[1-9A-HJ-NP-Za-km-z]{44,})/);
  const hash = ipfsHashMatch ? ipfsHashMatch[1] : null;
  
  return hash ? `https://ipfs.skatehive.app/ipfs/${hash}` : url;
};

/**
 * Parse media content and return array of MediaItem objects
 * This handles markdown images, iframes, IPFS URLs
 */
export const parseMediaContent = (mediaContent: string): MediaItem[] => {
  const mediaItems: MediaItem[] = [];

  mediaContent.split("\n").forEach((item: string) => {
    const trimmedItem = item.trim();
    if (!trimmedItem) return;

    // Handle plain YouTube URLs
    const youtubeId = extractYouTubeId(trimmedItem);
    if (youtubeId && !trimmedItem.includes('<iframe') && !trimmedItem.includes('![')) {
      const isShort = isYouTubeShort(trimmedItem);
      const embedUrl = `https://www.youtube-nocookie.com/embed/${youtubeId}`;
      const aspectRatio = isShort ? '9/16' : '16/9';
      mediaItems.push({
        type: "iframe",
        content: `<iframe src="${embedUrl}" width="100%" style="aspect-ratio: ${aspectRatio};" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`,
        src: embedUrl,
      });
      return;
    }

    // Handle plain Instagram URLs
    const instagramId = extractInstagramId(trimmedItem);
    if (instagramId && !trimmedItem.includes('<iframe') && !trimmedItem.includes('![')) {
      const embedUrl = `https://www.instagram.com/p/${instagramId}/embed/`;
      mediaItems.push({
        type: "iframe",
        content: `<iframe src="${embedUrl}" width="100%" style="aspect-ratio: 4/5; max-width: 540px; margin: 0 auto; border: none; overflow: hidden;" frameborder="0" scrolling="no" allowtransparency="true"></iframe>`,
        src: embedUrl,
      });
      return;
    }

    // Handle plain Twitter/X URLs
    const twitterId = extractTwitterId(trimmedItem);
    if (twitterId && !trimmedItem.includes('<iframe') && !trimmedItem.includes('![')) {
      const embedUrl = `https://platform.twitter.com/embed/Tweet.html?id=${twitterId}`;
      mediaItems.push({
        type: "iframe",
        content: `<iframe src="${embedUrl}" width="100%" style="max-width: 550px; min-height: 500px; height: auto; margin: 0 auto; border: 1px solid #e1e8ed; border-radius: 12px; overflow: hidden;" frameborder="0" scrolling="no"></iframe>`,
        src: embedUrl,
      });
      return;
    }

    // Handle plain 3Speak URLs (not in markdown or iframe)
    if (trimmedItem.includes('play.3speak.tv/embed?v=') && !trimmedItem.includes('<iframe') && !trimmedItem.includes('![')) {
      const urlMatch = trimmedItem.match(/(https?:\/\/play\.3speak\.tv\/embed\?v=[^\s<>"']+)/);
      if (urlMatch && urlMatch[1]) {
        let embedUrl = urlMatch[1];
        // Add mode=iframe for clean player display
        if (!embedUrl.includes('mode=iframe')) {
          embedUrl += '&mode=iframe';
        }
        // Add noscroll parameter to prevent scrollbars
        embedUrl = fix3SpeakUrl(embedUrl);
        mediaItems.push({
          type: "iframe",
          content: `<iframe src="${embedUrl}" width="100%" style="aspect-ratio: 16/9;" frameborder="0" allowfullscreen></iframe>`,
          src: embedUrl,
        });
        return;
      }
    }

    // Handle markdown images/videos with any IPFS gateway
    if (trimmedItem.includes("![") && trimmedItem.includes("http")) {
      // Extract ALL image markdown patterns from the line (there might be multiple or text before/after)
      const imageRegex = /!\[.*?\]\((https?:\/\/[^)]+)\)/g;
      let match;
      
      while ((match = imageRegex.exec(trimmedItem)) !== null) {
        const url = match[1];
        const fullMatch = match[0]; // The complete ![...](url) pattern
        
        // Check if it's an IPFS URL
        if (isIpfsUrl(url)) {
          // Convert to skatehive gateway for consistency
          const skatehiveUrl = convertToSkatehiveGateway(url);
          
          // Check if it's a video based on URL or assume video for IPFS without clear extension
          if (isVideoUrl(url)) {
            mediaItems.push({
              type: "video",
              content: fullMatch,
              src: skatehiveUrl,
            });
          } else {
            // For IPFS URLs without clear video extension, we could check content-type
            // For now, treat as image but this could be enhanced
            mediaItems.push({
              type: "image",
              content: fullMatch,
            });
          }
        } else {
          // Handle non-IPFS URLs
          if (isVideoUrl(url)) {
            mediaItems.push({
              type: "video",
              content: fullMatch,
              src: url,
            });
          } else {
            mediaItems.push({
              type: "image",
              content: fullMatch,
            });
          }
        }
      }
      return;
    }

    // Handle markdown images/videos with ipfs: protocol
    if (trimmedItem.includes("![") && trimmedItem.includes("ipfs:")) {
      const urlMatch = trimmedItem.match(/!\[.*?\]\((.*?)\)/);
      if (urlMatch && urlMatch[1]) {
        const url = urlMatch[1];
        if (isVideoUrl(url)) {
          mediaItems.push({
            type: "video",
            content: trimmedItem,
            src: url,
          });
        } else {
          mediaItems.push({
            type: "image",
            content: trimmedItem,
          });
        }
        return;
      }
    }

    // Handle iframes
    if (trimmedItem.includes("<iframe") && trimmedItem.includes("</iframe>")) {
      const srcMatch = trimmedItem.match(/src=["']([^"']+)["']/i);
      if (srcMatch && srcMatch[1]) {
        let url = srcMatch[1];
        
        // Add mode=iframe to 3Speak URLs if not present
        if (url.includes('play.3speak.tv/embed?v=') && !url.includes('mode=iframe')) {
          url += '&mode=iframe';
        }
        
        // Add noscroll parameter to 3Speak URLs
        if (url.includes('play.3speak.tv/embed')) {
          url = fix3SpeakUrl(url);
        }

        // Skip YouTube iframes (handled by auto-embed logic)
        if (
          url.includes("youtube.com/embed/") ||
          url.includes("youtube-nocookie.com/embed/") ||
          url.includes("youtu.be/")
        ) {
          return;
        }

        // CRITICAL FIX: Treat ALL IPFS iframes as videos (even without extensions)
        // This prevents network spikes from IPFS content loading immediately
        if (isIpfsUrl(url)) {
          const skatehiveUrl = convertToSkatehiveGateway(url);
          mediaItems.push({
            type: "video",
            content: trimmedItem,
            src: skatehiveUrl,
          });
          return; // Always treat IPFS iframes as videos for lazy loading
        }

        // Other iframe embeds (non-IPFS)
        mediaItems.push({
          type: "iframe",
          content: trimmedItem,
          src: url,
        });
      }
    }
  });

  return mediaItems;
};
