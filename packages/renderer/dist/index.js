"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var index_exports = {};
__export(index_exports, {
  createHiveRenderer: () => createHiveRenderer,
  renderHiveMarkdown: () => renderHiveMarkdown
});
module.exports = __toCommonJS(index_exports);
var import_content_renderer = require("@hiveio/content-renderer");
var import_isomorphic_dompurify = __toESM(require("isomorphic-dompurify"));
var DEFAULT_IPFS_GATEWAY = "https://ipfs.3speak.tv";
var DEFAULT_IPFS_FALLBACKS = [
  "https://ipfs.skatehive.app",
  "https://cloudflare-ipfs.com",
  "https://ipfs.io"
];
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
  const renderer = new import_content_renderer.DefaultRenderer({
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
    html = transformIPFSContent(html, ipfsGateway, ipfsFallbackGateways);
    html = preventIPFSDownloads(html);
    if (convertHiveUrls) {
      html = convertHiveUrlsToInternal(html, hiveFrontends, internalUrlPrefix);
    }
    return import_isomorphic_dompurify.default.sanitize(html, DOMPURIFY_CONFIG);
  };
}
var renderHiveMarkdown = createHiveRenderer();
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  createHiveRenderer,
  renderHiveMarkdown
});
//# sourceMappingURL=index.js.map