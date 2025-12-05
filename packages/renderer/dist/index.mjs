// src/index.ts
import { DefaultRenderer } from "@hiveio/content-renderer";
import DOMPurify from "isomorphic-dompurify";
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
    "reversed"
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
function transformIPFSContent(content, ipfsGateway) {
  const regex = new RegExp(
    `<iframe src="${ipfsGateway.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/ipfs/([a-zA-Z0-9-?=&]+)"(?:(?!<\\/iframe>).)*\\sallowfullscreen><\\/iframe>`,
    "g"
  );
  return content.replace(regex, (match, videoID) => {
    return `<video controls muted preload="none" loading="lazy"> 
                    <source src="${ipfsGateway}/ipfs/${videoID}" type="video/mp4">
                </video>`;
  });
}
function preventIPFSDownloads(content) {
  return content.replace(
    /<a href="(https?:\/\/[^"]*(?:ipfs|bafy|Qm)[^"]*)"([^>]*)>/gi,
    `<a href="$1" target="_blank" rel="noopener noreferrer"$2 onclick="event.preventDefault(); window.open(this.href, '_blank'); return false;">`
  );
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
    ipfsGateway = "https://ipfs.skatehive.app",
    usertagUrlFn = (account) => "/@" + account,
    hashtagUrlFn = (hashtag) => "/trending/" + hashtag,
    additionalHiveFrontends = [],
    convertHiveUrls = true,
    internalUrlPrefix = "",
    assetsWidth = 540,
    assetsHeight = 380,
    imageProxyFn
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
  return function renderHiveMarkdown2(markdown) {
    let html = renderer.render(markdown);
    html = transform3SpeakContent(html);
    html = transformIPFSContent(html, ipfsGateway);
    html = preventIPFSDownloads(html);
    if (convertHiveUrls) {
      html = convertHiveUrlsToInternal(html, hiveFrontends, internalUrlPrefix);
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