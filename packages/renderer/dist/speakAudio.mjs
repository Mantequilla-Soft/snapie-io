// src/speakAudio.ts
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
export {
  canonicalSpeakAudioUrl
};
//# sourceMappingURL=speakAudio.mjs.map