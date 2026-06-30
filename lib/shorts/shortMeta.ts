// Pure helpers for resolving a Snapie Short's display metadata from a Hive post
// plus the 3speak watch API. Kept free of network/IO so they can be unit-tested.

const FILENAME_TITLE_RE = /\.(mp4|mov|webm|m4v|avi|mkv|m3u8|gif)$/i;

/**
 * The chat URL / share link carries the Hive post permlink, but the video player
 * needs the 3speak video permlink. The Hive post's json_metadata.video.url looks
 * like `https://play.3speak.tv/embed?v=<author>/<videoPermlink>`, so we recover it
 * from there. Falls back to the hive permlink (legacy 3speak posts use the same).
 */
export function extractVideoPermlink(jsonMetadata: any, fallbackPermlink: string): string {
  const url: string | undefined = jsonMetadata?.video?.url;
  if (typeof url === 'string') {
    const m = url.match(/[?&]v=([^/\s&]+)\/([^&\s/]+)/);
    if (m && m[2]) return m[2];
  }
  return fallbackPermlink;
}

/** 3speak watch titles are frequently raw upload filenames — useless as a card title. */
export function isFilenameTitle(title: string | null | undefined): boolean {
  if (!title) return false;
  return FILENAME_TITLE_RE.test(title.trim());
}

/** First human-meaningful line of a post body: drop bare URLs, markdown image/embeds. */
export function firstBodyLine(body: string | null | undefined): string {
  if (!body) return '';
  const lines = body.split('\n');
  for (const raw of lines) {
    const line = raw
      .replace(/!\[[^\]]*\]\([^)]*\)/g, '') // markdown images
      .replace(/https?:\/\/\S+/g, '')        // bare urls
      .replace(/#[\w-]+/g, '')               // hashtag tokens
      .replace(/[>*_`]/g, '')                // light markdown punctuation
      .replace(/\s{2,}/g, ' ')
      .trim();
    if (line) return line.length > 120 ? `${line.slice(0, 117)}…` : line;
  }
  return '';
}

/**
 * Best display title: the Hive post title, else the first meaningful body line,
 * else the watch-API title (unless it's a filename), else empty.
 */
export function pickTitle(post: { title?: string; body?: string } | null | undefined, watchTitle?: string | null): string {
  const postTitle = post?.title?.trim();
  if (postTitle) return postTitle;
  const bodyLine = firstBodyLine(post?.body);
  if (bodyLine) return bodyLine;
  const wt = watchTitle?.trim();
  if (wt && !isFilenameTitle(wt)) return wt;
  return '';
}

/** Thumbnail: prefer the 3speak watch thumbnail, fall back to json_metadata.image[0]. */
export function pickThumbnail(watchThumb?: string | null, jsonImage?: string | null): string {
  const wt = watchThumb?.trim();
  if (wt) return wt;
  const img = jsonImage?.trim();
  if (img) return img;
  return '';
}
