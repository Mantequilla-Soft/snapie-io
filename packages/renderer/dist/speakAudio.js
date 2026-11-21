"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
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
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/speakAudio.ts
var speakAudio_exports = {};
__export(speakAudio_exports, {
  canonicalSpeakAudioUrl: () => canonicalSpeakAudioUrl
});
module.exports = __toCommonJS(speakAudio_exports);
function canonicalSpeakAudioUrl(url) {
  let u;
  try {
    u = new URL(url.replace(/&amp;/gi, "&").trim());
  } catch {
    return null;
  }
  if (!/^(www\.)?3speak\.tv$/i.test(u.hostname)) return null;
  if (/^\/audio\/?$/.test(u.pathname)) {
    const id = u.searchParams.get("play")?.match(/^@?[a-z0-9.-]+\/([A-Za-z0-9-]+)$/i)?.[1];
    return id ? `https://audio.3speak.tv/play?a=${id}` : null;
  }
  const list = u.pathname.match(/^\/playlist\/([A-Za-z0-9-]{8,64})\/?$/)?.[1];
  return list ? `https://audio.3speak.tv/play?list=${list}` : null;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  canonicalSpeakAudioUrl
});
//# sourceMappingURL=speakAudio.js.map