import { Discussion } from "@hiveio/dhive";

/**
 * The snap "container" post that all top-level snaps reply to. Top snaps have this
 * post as their direct parent. Navigating to it loads every snap reply at once
 * (hundreds of them), so parent links must never point here.
 */
export const SNAP_CONTAINER_AUTHOR = "peak.snaps";
export const SNAP_CONTAINER_PERMLINK = "snaps";

/**
 * True when (author, permlink) refers to the snap container post. A reply whose
 * parent is the container is a "top snap" — we hide its parent link to avoid
 * dumping the entire container thread on the user.
 */
export function isSnapContainer(author?: string | null, permlink?: string | null): boolean {
  if (!author) return false;
  // Permlink may be unknown in some call sites; author match alone is a safe signal
  // since the container account only hosts the snaps thread.
  if (author !== SNAP_CONTAINER_AUTHOR) return false;
  return !permlink || permlink === SNAP_CONTAINER_PERMLINK;
}

/**
 * Ecency's equivalent of the snap container — same mechanics (top-level replies
 * to a container post), different account. Unlike peak.snaps, the container
 * permlink rotates daily (waves-YYYY-MM-DD) rather than staying fixed, so there
 * is no single permlink to compare against — author match alone is the signal.
 */
export const WAVE_CONTAINER_AUTHOR = "ecency.waves";

/** True when `author` is the wave container account — see isSnapContainer. */
export function isWaveContainer(author?: string | null, _permlink?: string | null): boolean {
  return author === WAVE_CONTAINER_AUTHOR;
}

/** Wrapper aspect for iframe/video embeds (avoids forcing vertical content into 16/9). */
export type EmbedAspect = "16/9" | "9/16" | "4/5" | "3/4";

/** Stable id for 3Speak embed/watch URLs (`v=owner/permlink`). */
export function speakVideoKeyFromUrl(url: string): string | null {
  try {
    const v = new URL(url).searchParams.get("v");
    return v ? decodeURIComponent(v) : null;
  } catch {
    const m = url.match(/[?&]v=([^&]+)/);
    return m ? decodeURIComponent(m[1]) : null;
  }
}

/**
 * 3Speak desktop layout targets 16:9; mobile layout matches portrait feeds (~3:4).
 * Without this, vertical clips sit in a desktop chrome layout → huge black band + misplaced controls.
 */
export function speakPlaybackUrl(url: string, portrait: boolean): string {
  if (!url.includes("play.3speak.tv")) return url;
  try {
    const u = new URL(url);
    u.searchParams.set("layout", portrait ? "mobile" : "desktop");
    if (u.pathname.includes("embed")) {
      u.searchParams.set("noscroll", "1");
    }
    return u.toString();
  } catch {
    return url;
  }
}

export interface MediaItem {
  type: "image" | "video" | "iframe";
  content: string;
  src?: string;
  /** When set, MediaRenderer uses this instead of default 16/9 until 3Speak reports vertical. */
  embedAspect?: EmbedAspect;
}

/** Pixel height for audio.3speak.tv compact embed (their docs recommend ~120; 65px breaks layout + theming). */
export const SPEAK_AUDIO_IFRAME_HEIGHT_PX = 116;

/**
 * Normalize 3Speak audio play URLs for in-app embeds (compact iframe mode per audio.3speak.tv docs).
 */
export function finalizeAudio3SpeakEmbedUrl(url: string): string {
  if (!url.includes("audio.3speak.tv/play")) return url;
  try {
    const u = new URL(url.replace(/^http:/i, "https:"));
    u.searchParams.set("mode", "compact");
    u.searchParams.set("iframe", "1");
    return u.toString();
  } catch {
    let s = url.replace(/^http:/i, "https:");
    const join = s.includes("?") ? "&" : "?";
    if (!/[?&]iframe=/.test(s)) s += `${join}iframe=1`;
    if (!/[?&]mode=/.test(s)) s += "&mode=compact";
    return s;
  }
}

export interface SnapieAudioApiMeta {
  permlink: string;
  title?: string;
  duration?: number;
  audioUrl: string;
  audioUrlFallback?: string;
}

/** Resolve metadata for a 3Speak play URL (tries `a` as-given, then trailing segment after `/`). */
export async function fetchSnapieAudioMetadata(
  playUrl: string
): Promise<SnapieAudioApiMeta | null> {
  let u: URL;
  try {
    u = new URL(playUrl.replace(/^http:/i, "https:"));
  } catch {
    return null;
  }
  const base = "https://audio.3speak.tv/api/audio";
  const fetchMeta = async (qs: string): Promise<SnapieAudioApiMeta | null> => {
    const res = await fetch(`${base}?${qs}`);
    if (!res.ok) return null;
    const data = (await res.json()) as SnapieAudioApiMeta;
    return data?.audioUrl ? data : null;
  };

  const cid = u.searchParams.get("cid");
  if (cid) {
    const m = await fetchMeta(`cid=${encodeURIComponent(cid)}`);
    if (m) return m;
  }

  const a = u.searchParams.get("a");
  if (!a) return null;

  const attempts: string[] = [a];
  if (a.includes("/")) {
    const tail = a.split("/").pop();
    if (tail && tail !== a) attempts.push(tail);
  }

  for (const id of [...new Set(attempts)]) {
    const m = await fetchMeta(`a=${encodeURIComponent(id)}`);
    if (m) return m;
  }
  return null;
}

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
 * Extract YouTube video ID from various YouTube URL formats.
 * Supports watch, short links, shorts, embed, and live routes.
 */
export function extractYouTubeId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/live\/([a-zA-Z0-9_-]{11})/
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
 * Build a safe external fallback URL for blocked iframe embeds.
 * Useful for privacy-focused browsers/extensions that block embedded players.
 */
export function getEmbedFallback(src: string): { href: string; label: string } | null {
  if (!src) return null;

  // YouTube embed variants (youtube.com/embed/* and youtube-nocookie.com/embed/*)
  if (src.includes('youtube.com/embed/') || src.includes('youtube-nocookie.com/embed/')) {
    const idMatch = src.match(/\/embed\/([a-zA-Z0-9_-]{11})/i);
    if (!idMatch?.[1]) return null;
    return {
      href: `https://www.youtube.com/watch?v=${idMatch[1]}`,
      label: 'Open video on YouTube',
    };
  }

  // 3Speak embed/watch variants
  if (src.includes('play.3speak.tv')) {
    try {
      const u = new URL(src);
      const v = u.searchParams.get('v');
      if (!v) return null;
      const decoded = decodeURIComponent(v);
      return {
        href: `https://3speak.tv/watch?v=${decoded}`,
        label: 'Open video on 3Speak',
      };
    } catch {
      const m = src.match(/[?&]v=([^&]+)/);
      if (!m?.[1]) return null;
      let decoded = m[1];
      try { decoded = decodeURIComponent(decoded); } catch {}
      return {
        href: `https://3speak.tv/watch?v=${decoded}`,
        label: 'Open video on 3Speak',
      };
    }
  }

  // Reddit embed variants
  if (src.includes('embed.reddit.com')) {
    const m = src.match(/embed\.reddit\.com\/r\/([^/]+)\/comments\/([a-z0-9]+)/i);
    if (!m) return null;
    return {
      href: `https://www.reddit.com/r/${m[1]}/comments/${m[2]}/`,
      label: 'Open on Reddit',
    };
  }

  return null;
}

/**
 * Extract Reddit post info from various Reddit URL formats.
 * Returns { subreddit, postId } or null.
 */
function extractRedditPost(url: string): { subreddit: string; postId: string } | null {
  const m = url.match(/reddit\.com\/r\/([^/]+)\/comments\/([a-z0-9]+)/i);
  if (m) return { subreddit: m[1], postId: m[2] };
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
    // Check if line contains markdown image, iframe, 3Speak URLs (watch or embed), YouTube URL, Instagram URL, Twitter/X URL, or 3Speak Audio URL
    if (line.match(/!\[.*?\]\(.*\)/) || 
        line.match(/<iframe.*<\/iframe>/) ||
        line.match(/https?:\/\/(play\.)?3speak\.tv\/(watch|embed)\?v=/) ||
        line.match(/https?:\/\/audio\.3speak\.tv\/play\?a=/) ||
        line.match(/https?:\/\/(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)/) ||
        line.match(/https?:\/\/(www\.)?instagram\.com\/(p|reel|tv)\//) ||
        line.match(/https?:\/\/(twitter\.com|x\.com)\/[^/]+\/status\/\d+/) ||
        line.match(/https?:\/\/(www\.)?reddit\.com\/r\/[^/]+\/comments\/[a-z0-9]+/i)) {
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
    'busy.org',
    'snapie.io'
  ];
  
  const results: Array<{ url: string; author: string; permlink: string }> = [];
  
  // Create pattern for all frontends
  const frontendsPattern = hiveFrontends.map(domain => domain.replace('.', '\\.')).join('|');
  
  // Match Hive post URLs: https://frontend.com/category/@author/permlink or https://frontend.com/@author/permlink
  // Also handles www. subdomain
  const hiveUrlRegex = new RegExp(
    `https?:\\/\\/(?:www\\.)?(${frontendsPattern})\\/((?:[^/\\s]+\\/)?@([a-z0-9.-]+)\\/([a-z0-9-]+))`,
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
 * Extract hangout room names from snap content.
 * Matches: https://hangout.3speak.tv/room/<room-name>
 */
export function extractHangoutUrls(content: string): string[] {
  const pattern = /https?:\/\/hangout\.3speak\.tv\/room\/([\w-]+)/g;
  const results: string[] = [];
  let match;
  while ((match = pattern.exec(content)) !== null) {
    results.push(match[1]);
  }
  return results;
}

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

/** Best-effort aspect for raw iframe src (user markdown); 3Speak vertical still comes from postMessage. */
export function inferEmbedAspectFromIframeSrc(src: string): EmbedAspect | undefined {
  if (src.includes("instagram.com")) return "4/5";
  if (src.includes("audio.3speak.tv")) return undefined;
  return undefined;
}

/**
 * Parse media content and return array of MediaItem objects
 * This handles markdown images, iframes, IPFS URLs
 */
const SPEAK_VIDEO_ALLOW = 'allow="autoplay; encrypted-media; fullscreen; picture-in-picture"';

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
      mediaItems.push({
        type: "iframe",
        content: `<iframe src="${embedUrl}" width="100%" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`,
        src: embedUrl,
        embedAspect: isShort ? "9/16" : "16/9",
      });
      return;
    }

    // Handle plain Instagram URLs
    const instagramId = extractInstagramId(trimmedItem);
    if (instagramId && !trimmedItem.includes('<iframe') && !trimmedItem.includes('![')) {
      const embedUrl = `https://www.instagram.com/p/${instagramId}/embed/`;
      mediaItems.push({
        type: "iframe",
        content: `<iframe src="${embedUrl}" width="100%" frameborder="0" scrolling="no" allowtransparency="true"></iframe>`,
        src: embedUrl,
        embedAspect: "4/5",
      });
      return;
    }

    // Handle plain Twitter/X URLs
    const twitterId = extractTwitterId(trimmedItem);
    if (twitterId && !trimmedItem.includes('<iframe') && !trimmedItem.includes('![')) {
      const embedUrl = `https://platform.twitter.com/embed/Tweet.html?id=${twitterId}&dnt=true`;
      mediaItems.push({
        type: "iframe",
        content: `<iframe src="${embedUrl}" width="100%" style="max-width: 550px; min-height: 500px; height: auto; margin: 0 auto; border: 1px solid #e1e8ed; border-radius: 12px; overflow: hidden;" frameborder="0" scrolling="no"></iframe>`,
        src: embedUrl,
      });
      return;
    }

    // Handle plain Reddit post URLs
    const redditPost = extractRedditPost(trimmedItem);
    if (redditPost && !trimmedItem.includes('<iframe') && !trimmedItem.includes('![')) {
      const { subreddit, postId } = redditPost;
      const embedUrl = `https://embed.reddit.com/r/${subreddit}/comments/${postId}/?embed=true&theme=dark`;
      mediaItems.push({
        type: "iframe",
        content: `<iframe src="${embedUrl}" width="100%" frameborder="0" scrolling="no" allowfullscreen style="border-radius:12px;"></iframe>`,
        src: embedUrl,
        embedAspect: "16/9",
      });
      return;
    }

    // Handle legacy 3speak.tv watch URLs (without play. subdomain)
    if (trimmedItem.includes('3speak.tv/watch?v=') && !trimmedItem.includes('play.3speak.tv') && !trimmedItem.includes('<iframe') && !trimmedItem.includes('![')) {
      const urlMatch = trimmedItem.match(/(https?:\/\/3speak\.tv\/watch\?v=[^\s<>"']+)/);
      if (urlMatch && urlMatch[1]) {
        const videoIdMatch = urlMatch[1].match(/v=([^&\s]+)/);
        if (videoIdMatch && videoIdMatch[1]) {
          const embedUrl = `https://play.3speak.tv/watch?v=${videoIdMatch[1]}&mode=iframe&captions=0&layout=desktop`;
          mediaItems.push({
            type: "iframe",
            content: `<iframe src="${embedUrl}" width="100%" frameborder="0" ${SPEAK_VIDEO_ALLOW} allowfullscreen></iframe>`,
            src: embedUrl,
            embedAspect: "16/9",
          });
          return;
        }
      }
    }

    // Handle 3Speak watch URLs - these are from 3speak.tv frontend
    if (trimmedItem.includes('play.3speak.tv/watch?v=') && !trimmedItem.includes('<iframe') && !trimmedItem.includes('![')) {
      const urlMatch = trimmedItem.match(/(https?:\/\/play\.3speak\.tv\/watch\?v=[^\s<>"']+)/);
      if (urlMatch && urlMatch[1]) {
        const videoIdMatch = urlMatch[1].match(/v=([^&\s]+)/);
        if (videoIdMatch && videoIdMatch[1]) {
          const embedUrl = `https://play.3speak.tv/watch?v=${videoIdMatch[1]}&mode=iframe&captions=0&layout=desktop`;
          mediaItems.push({
            type: "iframe",
            content: `<iframe src="${embedUrl}" width="100%" frameborder="0" ${SPEAK_VIDEO_ALLOW} allowfullscreen></iframe>`,
            src: embedUrl,
            embedAspect: "16/9",
          });
          return;
        }
      }
    }

    // Handle plain 3Speak embed URLs (not in markdown or iframe)
    if (trimmedItem.includes('play.3speak.tv/embed?v=') && !trimmedItem.includes('<iframe') && !trimmedItem.includes('![')) {
      const urlMatch = trimmedItem.match(/(https?:\/\/play\.3speak\.tv\/embed\?v=[^\s<>"']+)/);
      if (urlMatch && urlMatch[1]) {
        let embedUrl = urlMatch[1];
        // Ensure mode=iframe, captions=0, and layout=desktop are set
        if (!embedUrl.includes('mode=iframe')) embedUrl += '&mode=iframe';
        if (!embedUrl.includes('captions=')) embedUrl += '&captions=0';
        if (!embedUrl.includes('layout=')) embedUrl += '&layout=desktop';
        // Add noscroll parameter to prevent scrollbars
        embedUrl = fix3SpeakUrl(embedUrl);
        mediaItems.push({
          type: "iframe",
          content: `<iframe src="${embedUrl}" width="100%" frameborder="0" ${SPEAK_VIDEO_ALLOW} allowfullscreen></iframe>`,
          src: embedUrl,
          embedAspect: "16/9",
        });
        return;
      }
    }

    // Handle 3Speak Audio URLs
    if (trimmedItem.includes('audio.3speak.tv/play?a=') && !trimmedItem.includes('<iframe') && !trimmedItem.includes('![')) {
      const urlMatch = trimmedItem.match(/(https?:\/\/audio\.3speak\.tv\/play\?a=[^\s<>"']+)/);
      if (urlMatch && urlMatch[1]) {
        const embedUrl = finalizeAudio3SpeakEmbedUrl(urlMatch[1]);
        const h = SPEAK_AUDIO_IFRAME_HEIGHT_PX;
        mediaItems.push({
          type: "iframe",
          content: `<div class="audio-container" style="width: 100%; max-width: 550px; height: ${h}px; margin: 0 auto; overflow: hidden;"><iframe src="${embedUrl}" width="100%" height="${h}" frameborder="0" scrolling="no" allow="autoplay; encrypted-media" allowtransparency="true" style="display: block; background: transparent;"></iframe></div>`,
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
        let embedUrl = url;
        if (url.includes("audio.3speak.tv")) {
          embedUrl = finalizeAudio3SpeakEmbedUrl(url);
        }
        const content =
          embedUrl === url
            ? trimmedItem
            : trimmedItem.replace(/src=["'][^"']+["']/i, `src="${embedUrl}"`);
        mediaItems.push({
          type: "iframe",
          content,
          src: embedUrl,
          embedAspect: inferEmbedAspectFromIframeSrc(embedUrl),
        });
      }
    }
  });

  return mediaItems;
};
