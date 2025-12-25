// src/index.ts
import { DefaultRenderer } from "@hiveio/content-renderer";
import DOMPurify from "isomorphic-dompurify";
var DEFAULT_IPFS_GATEWAY = "https://ipfs.3speak.tv";
var DEFAULT_IPFS_FALLBACKS = [
  "https://ipfs.skatehive.app",
  "https://cloudflare-ipfs.com",
  "https://ipfs.io"
];
var DEFAULT_HIVEMOJI_BASE_URL = "https://hivemoji.hivelytics.io";
var HIVEMOJI_REGEX = /:([a-z0-9._-]+\/)?([a-z0-9._-]{1,32}):/gi;
var HIVEMOJI_SKIP_TAGS = /* @__PURE__ */ new Set([
  "script",
  "style",
  "textarea",
  "code",
  "pre",
  "kbd",
  "samp"
]);
var DEFAULT_HIVE_FRONTENDS = [
  "peakd.com",
  "ecency.com",
  "hive.blog",
  "hiveblog.io",
  "leofinance.io",
  "3speak.tv",
  "d.tube",
  "esteem.app",
  "busy.org"
];
var DOMPURIFY_CONFIG = {
  ALLOWED_TAGS: [
    // Text formatting
    "p",
    "br",
    "span",
    "div",
    "blockquote",
    "pre",
    "code",
    "strong",
    "em",
    "b",
    "i",
    "u",
    "ins",
    "del",
    "s",
    "strike",
    "mark",
    "sub",
    "sup",
    "small",
    // Headings
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    // Lists
    "ul",
    "ol",
    "li",
    "dl",
    "dt",
    "dd",
    // Tables
    "table",
    "thead",
    "tbody",
    "tfoot",
    "tr",
    "th",
    "td",
    "caption",
    "col",
    "colgroup",
    // Links and media
    "a",
    "img",
    "video",
    "source",
    "audio",
    "iframe",
    // Other safe elements
    "hr",
    "center",
    "details",
    "summary"
  ],
  ALLOWED_ATTR: [
    "href",
    "src",
    "alt",
    "title",
    "width",
    "height",
    "class",
    "id",
    "style",
    "target",
    "rel",
    "controls",
    "muted",
    "preload",
    "loading",
    "autoplay",
    "loop",
    "type",
    "allowfullscreen",
    "frameborder",
    "allow",
    "scrolling",
    "colspan",
    "rowspan",
    "align",
    "valign",
    "start",
    "reversed",
    "data-dnt",
    "data-theme",
    "allowtransparency"
  ],
  ALLOWED_URI_REGEXP: /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp|ipfs):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
  ALLOW_DATA_ATTR: false,
  ALLOW_UNKNOWN_PROTOCOLS: false,
  FORBID_TAGS: ["script", "form", "input", "button", "textarea", "select", "dialog", "object", "embed", "applet", "base", "link", "meta"],
  FORBID_ATTR: ["onerror", "onload", "onclick", "onmouseover", "onmouseout", "onmousemove", "onmouseenter", "onmouseleave", "onfocus", "onblur", "onchange", "onsubmit", "onkeydown", "onkeyup", "onkeypress"],
  KEEP_CONTENT: true,
  RETURN_TRUSTED_TYPE: false
};
function fixMalformedCenterTags(content) {
  return content.replace(
    /<p><center>([\s\S]*?)<hr \/>([\s\S]*?)<\/center><\/p>/gi,
    (match, beforeHr, afterHr) => {
      return `<center>${beforeHr.trim()}</center><hr />${afterHr.trim()}`;
    }
  );
}
function transform3SpeakContent(content) {
  const embeddedVideos = /* @__PURE__ */ new Set();
  const embeddedAudios = /* @__PURE__ */ new Set();
  content = fixMalformedCenterTags(content);
  content = content.replace(
    /<a[^>]*href="(https?:\/\/3speak\.tv\/watch\?v=([^"&]+)[^"]*)"[^>]*>.*?<\/a>/g,
    (match, fullUrl, videoId) => {
      if (embeddedVideos.has(videoId)) return match;
      embeddedVideos.add(videoId);
      const embedUrl = `https://play.3speak.tv/watch?v=${videoId}&mode=iframe`;
      return `<div class="video-container"><iframe src="${embedUrl}" allowfullscreen loading="lazy"></iframe></div>`;
    }
  );
  content = content.replace(
    /<a[^>]*href="(https?:\/\/play\.3speak\.tv\/watch\?v=([^"&]+)[^"]*)"[^>]*>.*?<\/a>/g,
    (match, fullUrl, videoId) => {
      if (embeddedVideos.has(videoId)) return match;
      embeddedVideos.add(videoId);
      const embedUrl = `https://play.3speak.tv/watch?v=${videoId}&mode=iframe`;
      return `<div class="video-container"><iframe src="${embedUrl}" allowfullscreen loading="lazy"></iframe></div>`;
    }
  );
  content = content.replace(
    /<a[^>]*href="(https?:\/\/play\.3speak\.tv\/embed\?v=([^"&]+)[^"]*)"[^>]*>.*?<\/a>/g,
    (match, fullUrl, videoId) => {
      if (embeddedVideos.has(videoId)) return match;
      embeddedVideos.add(videoId);
      const embedUrl = `https://play.3speak.tv/embed?v=${videoId}&mode=iframe`;
      return `<div class="video-container"><iframe src="${embedUrl}" allowfullscreen loading="lazy"></iframe></div>`;
    }
  );
  content = content.replace(
    /<a[^>]*href="(https?:\/\/audio\.3speak\.tv\/play\?a=([^"&]+)[^"]*)"[^>]*>.*?<\/a>/g,
    (match, fullUrl, audioId) => {
      if (embeddedAudios.has(audioId)) return match;
      embeddedAudios.add(audioId);
      const embedUrl = `https://audio.3speak.tv/play?a=${audioId}`;
      return `<div class="audio-container"><iframe src="${embedUrl}" loading="lazy"></iframe></div>`;
    }
  );
  return content;
}
function transformTwitterContent(content) {
  const embeddedTweets = /* @__PURE__ */ new Set();
  const twitterRegex = /<a[^>]*href="(https?:\/\/(?:twitter\.com|x\.com)\/([^/]+)\/status\/(\d+)[^"]*)"[^>]*>.*?<\/a>/gi;
  content = content.replace(twitterRegex, (match, fullUrl, username, tweetId) => {
    if (embeddedTweets.has(tweetId)) return match;
    embeddedTweets.add(tweetId);
    return `<div class="twitter-embed-container" style="max-width: 550px;">
            <iframe 
                src="https://platform.twitter.com/embed/Tweet.html?id=${tweetId}&dnt=true" 
                width="550" 
                height="250" 
                frameborder="0" 
                scrolling="no" 
                allowtransparency="true"
                loading="lazy"
                style="border: 1px solid #ccc; border-radius: 12px;">
            </iframe>
        </div>`;
  });
  const plainTwitterRegex = /(?<![">])(https?:\/\/(?:twitter\.com|x\.com)\/([^/\s]+)\/status\/(\d+))(?![^<]*<\/a>)/gi;
  content = content.replace(plainTwitterRegex, (match, fullUrl, username, tweetId) => {
    if (embeddedTweets.has(tweetId)) return match;
    embeddedTweets.add(tweetId);
    return `<div class="twitter-embed-container" style="max-width: 550px;">
            <iframe 
                src="https://platform.twitter.com/embed/Tweet.html?id=${tweetId}&dnt=true" 
                width="550" 
                height="250" 
                frameborder="0" 
                scrolling="no" 
                allowtransparency="true"
                loading="lazy"
                style="border: 1px solid #ccc; border-radius: 12px;">
            </iframe>
        </div>`;
  });
  return content;
}
function transformInstagramContent(content) {
  const embeddedPosts = /* @__PURE__ */ new Set();
  const instagramRegex = /<a[^>]*href="(https?:\/\/(?:www\.)?instagram\.com\/(?:p|reel|tv)\/([a-zA-Z0-9_-]+)[^"]*)"[^>]*>.*?<\/a>/gi;
  content = content.replace(instagramRegex, (match, fullUrl, postCode) => {
    if (embeddedPosts.has(postCode)) return match;
    embeddedPosts.add(postCode);
    return `<div class="instagram-embed-container">
            <iframe 
                src="https://www.instagram.com/p/${postCode}/embed" 
                width="400" 
                height="480" 
                frameborder="0" 
                scrolling="no" 
                allowtransparency="true"
                loading="lazy">
            </iframe>
        </div>`;
  });
  const plainInstagramRegex = /(?<![">])(https?:\/\/(?:www\.)?instagram\.com\/(?:p|reel|tv)\/([a-zA-Z0-9_-]+)[^\s<]*)(?![^<]*<\/a>)/gi;
  content = content.replace(plainInstagramRegex, (match, fullUrl, postCode) => {
    if (embeddedPosts.has(postCode)) return match;
    embeddedPosts.add(postCode);
    return `<div class="instagram-embed-container">
            <iframe 
                src="https://www.instagram.com/p/${postCode}/embed" 
                width="400" 
                height="480" 
                frameborder="0" 
                scrolling="no" 
                allowtransparency="true"
                loading="lazy">
            </iframe>
        </div>`;
  });
  return content;
}
function transformIPFSContent(content, ipfsGateway, fallbackGateways) {
  const ipfsGatewayPatterns = [ipfsGateway, ...fallbackGateways, "https://ipfs.io", "https://gateway.pinata.cloud"];
  for (const gateway of ipfsGatewayPatterns) {
    const regex = new RegExp(
      `<iframe src="${gateway.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/ipfs/([a-zA-Z0-9-?=&]+)"(?:(?!<\\/iframe>).)*\\sallowfullscreen><\\/iframe>`,
      "g"
    );
    content = content.replace(regex, (match, videoID) => {
      const sources = [ipfsGateway, ...fallbackGateways].map((gw) => `<source src="${gw}/ipfs/${videoID}" type="video/mp4">`).join("\n                    ");
      return `<video controls muted preload="none" loading="lazy"> 
                    ${sources}
                </video>`;
    });
  }
  return content;
}
function preventIPFSDownloads(content) {
  return content.replace(
    /<a href="(https?:\/\/[^"]*(?:ipfs|bafy|Qm)[^"]*)"([^>]*)>/gi,
    `<a href="$1" target="_blank" rel="noopener noreferrer"$2 onclick="event.preventDefault(); window.open(this.href, '_blank'); return false;">`
  );
}
function normalizeHivemojiOwner(owner) {
  if (!owner) return null;
  const normalized = String(owner).replace(/^@/, "").trim();
  return normalized.length > 0 ? normalized : null;
}
function buildHivemojiUrl(baseUrl, owner, name) {
  return `${baseUrl}/@${encodeURIComponent(owner)}/@${encodeURIComponent(name)}`;
}
function createHivemojiElement(doc, baseUrl, owner, name, altText) {
  const span = doc.createElement("span");
  span.className = "hivemoji";
  span.setAttribute("role", "img");
  span.setAttribute("aria-label", altText);
  const text = doc.createElement("span");
  text.className = "hivemoji__text";
  text.textContent = altText;
  text.style.display = "none";
  const img = doc.createElement("img");
  img.className = "hivemoji__img";
  img.setAttribute("src", buildHivemojiUrl(baseUrl, owner, name));
  img.setAttribute("alt", "");
  img.setAttribute("aria-hidden", "true");
  img.setAttribute("loading", "lazy");
  img.setAttribute("decoding", "async");
  img.style.display = "inline-block";
  img.style.width = "1em";
  img.style.height = "1em";
  img.style.maxWidth = "none";
  img.style.maxHeight = "none";
  img.style.margin = "0";
  img.style.objectFit = "contain";
  img.style.verticalAlign = "middle";
  img.setAttribute(
    "onerror",
    'this.style.display="none";var p=this.parentElement;if(p){p.classList.add("hivemoji--fallback");var t=p.querySelector(".hivemoji__text");if(t){t.style.display="inline";}}'
  );
  span.style.display = "inline-flex";
  span.style.alignItems = "center";
  span.style.verticalAlign = "middle";
  span.style.margin = "0 0.05em";
  span.append(text, img);
  return span;
}
function transformHivemojiContent(content, options) {
  if (!content || !content.includes(":")) {
    return DOMPurify.sanitize(content, DOMPURIFY_CONFIG);
  }
  HIVEMOJI_REGEX.lastIndex = 0;
  if (!HIVEMOJI_REGEX.test(content)) {
    HIVEMOJI_REGEX.lastIndex = 0;
    return DOMPurify.sanitize(content, DOMPURIFY_CONFIG);
  }
  HIVEMOJI_REGEX.lastIndex = 0;
  const fragment = DOMPurify.sanitize(content, {
    ...DOMPURIFY_CONFIG,
    RETURN_DOM_FRAGMENT: true
  });
  const doc = fragment.ownerDocument;
  const root = fragment;
  if (!doc) {
    return DOMPurify.sanitize(content, DOMPURIFY_CONFIG);
  }
  const showText = doc.defaultView?.NodeFilter?.SHOW_TEXT ?? 4;
  const walker = doc.createTreeWalker(root, showText);
  const nodes = [];
  while (walker.nextNode()) {
    nodes.push(walker.currentNode);
  }
  const defaultOwner = normalizeHivemojiOwner(options.defaultOwner);
  for (const node of nodes) {
    const text = node.nodeValue;
    if (!text || !text.includes(":")) continue;
    const parent = node.parentElement;
    if (!parent) continue;
    if (HIVEMOJI_SKIP_TAGS.has(parent.tagName.toLowerCase())) continue;
    let changed = false;
    let lastIndex = 0;
    HIVEMOJI_REGEX.lastIndex = 0;
    const frag = doc.createDocumentFragment();
    for (const match of text.matchAll(HIVEMOJI_REGEX)) {
      const [full, ownerPart, name] = match;
      const ownerCandidate = ownerPart ? ownerPart.slice(0, -1) : defaultOwner;
      const owner = normalizeHivemojiOwner(ownerCandidate);
      if (!owner) continue;
      const index = match.index ?? 0;
      const before = text.slice(lastIndex, index);
      if (before) {
        frag.append(doc.createTextNode(before));
      }
      frag.append(createHivemojiElement(doc, options.baseUrl, owner, name, full));
      lastIndex = index + full.length;
      changed = true;
    }
    if (!changed) continue;
    const tail = text.slice(lastIndex);
    if (tail) {
      frag.append(doc.createTextNode(tail));
    }
    node.replaceWith(frag);
  }
  const container = doc.createElement("div");
  container.appendChild(fragment);
  return container.innerHTML;
}
function convertHiveUrlsToInternal(content, hiveFrontends, internalPrefix) {
  const frontendsPattern = hiveFrontends.map((domain) => domain.replace(".", "\\.")).join("|");
  const hiveUrlRegex = new RegExp(
    `<a href="https?:\\/\\/(?:www\\.)?(${frontendsPattern})\\/((?:[^/]+\\/)?@([a-z0-9.-]+)\\/([a-z0-9-]+))"([^>]*)>`,
    "gi"
  );
  return content.replace(hiveUrlRegex, (match, frontend, fullPath, author, permlink, attributes) => {
    const internalUrl = `${internalPrefix}/@${author}/${permlink}`;
    return `<a href="${internalUrl}"${attributes}>`;
  });
}
function createHiveRenderer(options = {}) {
  const {
    baseUrl = "https://hive.blog/",
    ipfsGateway = DEFAULT_IPFS_GATEWAY,
    ipfsFallbackGateways = DEFAULT_IPFS_FALLBACKS,
    usertagUrlFn = (account) => "/@" + account,
    hashtagUrlFn = (hashtag) => "/trending/" + hashtag,
    additionalHiveFrontends = [],
    convertHiveUrls = true,
    internalUrlPrefix = "",
    assetsWidth = 540,
    assetsHeight = 380,
    imageProxyFn,
    enableHivemoji = false,
    hivemojiBaseUrl = DEFAULT_HIVEMOJI_BASE_URL,
    hivemojiDefaultOwner
  } = options;
  const hiveFrontends = [...DEFAULT_HIVE_FRONTENDS, ...additionalHiveFrontends];
  const defaultImageProxy = (url) => {
    try {
      if (url.includes("ipfs")) {
        const parts = url.split("/ipfs/");
        if (parts[1]) {
          return `https://ipfs.io/ipfs/${parts[1]}`;
        }
      }
      return url;
    } catch {
      return url;
    }
  };
  const renderer = new DefaultRenderer({
    baseUrl,
    breaks: true,
    skipSanitization: false,
    allowInsecureScriptTags: false,
    addNofollowToLinks: true,
    doNotShowImages: false,
    assetsWidth,
    assetsHeight,
    imageProxyFn: imageProxyFn || defaultImageProxy,
    usertagUrlFn,
    hashtagUrlFn,
    isLinkSafeFn: () => true,
    addExternalCssClassToMatchingLinksFn: () => true,
    ipfsPrefix: ipfsGateway
  });
  return function renderHiveMarkdown2(markdown, context = {}) {
    let html = renderer.render(markdown);
    html = transform3SpeakContent(html);
    html = transformIPFSContent(html, ipfsGateway, ipfsFallbackGateways);
    html = transformTwitterContent(html);
    html = transformInstagramContent(html);
    html = preventIPFSDownloads(html);
    if (convertHiveUrls) {
      html = convertHiveUrlsToInternal(html, hiveFrontends, internalUrlPrefix);
    }
    if (enableHivemoji) {
      const defaultEmojiOwner = context.defaultEmojiOwner || hivemojiDefaultOwner;
      return transformHivemojiContent(html, {
        baseUrl: hivemojiBaseUrl,
        defaultOwner: defaultEmojiOwner
      });
    }
    return DOMPurify.sanitize(html, DOMPURIFY_CONFIG);
  };
}
var renderHiveMarkdown = createHiveRenderer();
export {
  createHiveRenderer,
  renderHiveMarkdown
};
//# sourceMappingURL=index.mjs.map