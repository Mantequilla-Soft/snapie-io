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

// src/limits.ts
var limits_exports = {};
__export(limits_exports, {
  AUDIO_DURATION_GRACE_SECONDS: () => AUDIO_DURATION_GRACE_SECONDS,
  AUDIO_SERVICE_BASE: () => AUDIO_SERVICE_BASE,
  EMBED_SERVICE_BASE: () => EMBED_SERVICE_BASE,
  UploadLimitError: () => UploadLimitError,
  audioMaxSeconds: () => audioMaxSeconds,
  audioTooLong: () => audioTooLong,
  blockedByQuota: () => blockedByQuota,
  defaultUpgradeUrl: () => defaultUpgradeUrl,
  fetchAudioQuota: () => fetchAudioQuota,
  fetchVideoQuota: () => fetchVideoQuota,
  formatLength: () => formatLength,
  formatNextSlot: () => formatNextSlot,
  formatUploadLimitMessage: () => formatUploadLimitMessage,
  isUploadLimitError: () => isUploadLimitError,
  parseUploadLimit: () => parseUploadLimit,
  quotaApplies: () => quotaApplies,
  readUploadLimit: () => readUploadLimit,
  uploadLimitFromTusError: () => uploadLimitFromTusError
});
module.exports = __toCommonJS(limits_exports);
var EMBED_SERVICE_BASE = "https://embed.3speak.tv";
var AUDIO_SERVICE_BASE = "https://audio.3speak.tv";
var LIMIT_CODES = ["daily_upload_limit", "daily_audio_limit", "audio_too_long"];
var UploadLimitError = class extends Error {
  constructor(info) {
    super(formatUploadLimitMessage(info));
    this.isUploadLimitError = true;
    this.name = "UploadLimitError";
    this.info = info;
  }
};
function isUploadLimitError(error) {
  return !!error && typeof error === "object" && error.isUploadLimitError === true && typeof error.info === "object";
}
var num = (v) => typeof v === "number" && Number.isFinite(v) ? v : null;
var str = (v) => typeof v === "string" && v.trim() ? v : null;
function parseUploadLimit(status, body, retryAfterHeader) {
  if (status !== 429 && status !== 413) return null;
  if (!body || typeof body !== "object") return null;
  const b = body;
  const code = typeof b.code === "string" ? b.code : "";
  if (!LIMIT_CODES.includes(code)) return null;
  const kind = code === "daily_upload_limit" ? b.kind === "short" ? "short" : "video" : "audio";
  const header = retryAfterHeader != null && /^\d+$/.test(retryAfterHeader.trim()) ? Number(retryAfterHeader.trim()) : null;
  return {
    code,
    kind,
    status,
    message: str(b.message) ?? str(b.error) ?? "Upload limit reached. 3Speak Pro removes this limit.",
    upgradeUrl: str(b.upgrade_url),
    limit: num(b.limit),
    used: num(b.used),
    nextAt: str(b.next_at),
    retryAfterSeconds: num(b.retry_after_seconds) ?? header,
    maxSeconds: num(b.max_seconds),
    duration: num(b.duration)
  };
}
async function readUploadLimit(response) {
  if (response.status !== 429 && response.status !== 413) return null;
  try {
    const body = await response.clone().json();
    return parseUploadLimit(response.status, body, response.headers.get("Retry-After"));
  } catch {
    return null;
  }
}
function uploadLimitFromTusError(error) {
  const res = error?.originalResponse;
  if (!res || typeof res.getStatus !== "function") return null;
  const status = res.getStatus();
  if (status !== 429 && status !== 413) return null;
  try {
    const body = JSON.parse(res.getBody?.() || "");
    return parseUploadLimit(status, body, res.getHeader?.("Retry-After") ?? null);
  } catch {
    return null;
  }
}
function formatNextSlot(nextAt, opts = {}) {
  if (!nextAt) return null;
  const date = new Date(nextAt);
  if (Number.isNaN(date.getTime())) return null;
  try {
    return date.toLocaleString(opts.locale, {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone: opts.timeZone
    });
  } catch {
    return null;
  }
}
var plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
function formatLength(seconds) {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  const m = Math.floor(total / 60);
  const s = total % 60;
  if (m === 0) return plural(s, "second");
  return s ? `${plural(m, "minute")} ${plural(s, "second")}` : plural(m, "minute");
}
function clock(seconds) {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor(s % 3600 / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}
var NOUN = {
  video: ["video", "videos"],
  short: ["short", "shorts"],
  audio: ["audio file", "audio files"]
};
function formatUploadLimitMessage(info, opts = {}) {
  const pro = "3Speak Pro removes this limit.";
  if (info.code === "audio_too_long") {
    if (info.maxSeconds == null) return info.message;
    const length = info.duration != null ? ` This file is ${clock(info.duration)} long.` : "";
    return `Free accounts can upload audio up to ${formatLength(info.maxSeconds)} long.${length} ${pro}`;
  }
  const when = formatNextSlot(info.nextAt, opts);
  if (info.limit == null || info.limit <= 0 || !when) return info.message;
  const [one, many] = NOUN[info.kind];
  const next = info.kind === "audio" ? "audio upload" : `${one} upload`;
  return `Free accounts can upload ${info.limit} ${info.limit === 1 ? one : many} per 24 hours. Your next ${next} is possible on ${when}. ${pro}`;
}
function defaultUpgradeUrl(owner) {
  return `https://3speak.tv/wallet/${encodeURIComponent(owner.trim().replace(/^@/, "").toLowerCase())}#pro`;
}
async function getJson(url, headers, req) {
  const doFetch = req.fetchImpl ?? (typeof fetch === "function" ? fetch : null);
  if (!doFetch || !req.apiKey || !req.owner) return null;
  const controller = typeof AbortController === "function" ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), req.timeoutMs ?? 5e3) : null;
  try {
    const res = await doFetch(url, { headers, signal: controller?.signal });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
var isKindQuota = (v) => !!v && typeof v === "object" && "remaining" in v;
async function fetchVideoQuota(req) {
  const base = req.baseUrl ?? EMBED_SERVICE_BASE;
  const owner = req.owner.trim().replace(/^@/, "");
  const data = await getJson(
    `${base}/uploads/quota?owner=${encodeURIComponent(owner)}`,
    { "X-API-Key": req.apiKey },
    { ...req, owner }
  );
  if (!data || typeof data.enabled !== "boolean" || !isKindQuota(data.video) || !isKindQuota(data.short)) return null;
  return data;
}
async function fetchAudioQuota(req) {
  const base = req.baseUrl ?? AUDIO_SERVICE_BASE;
  const owner = req.owner.trim().replace(/^@/, "");
  const data = await getJson(
    `${base}/api/audio/quota`,
    { "X-API-Key": req.apiKey, "X-User": owner },
    { ...req, owner }
  );
  if (!data || typeof data.enabled !== "boolean" || !isKindQuota(data.audio)) return null;
  return data;
}
function quotaApplies(quota) {
  return !!quota && quota.enabled && !quota.exempt;
}
function blockedByQuota(quota, kind, owner) {
  if (!quotaApplies(quota)) return null;
  const k = kind === "audio" ? quota.audio : quota[kind];
  if (!k || k.remaining !== 0 || k.limit == null) return null;
  if (k.next_at && Date.parse(k.next_at) <= Date.now()) return null;
  const [one, many] = NOUN[kind];
  const code = kind === "audio" ? "daily_audio_limit" : "daily_upload_limit";
  return {
    code,
    kind,
    status: 429,
    message: `Free accounts can upload ${k.limit} ${k.limit === 1 ? one : many} per 24 hours. 3Speak Pro removes this limit.`,
    upgradeUrl: defaultUpgradeUrl(owner),
    limit: k.limit,
    used: num(k.used),
    nextAt: k.next_at,
    retryAfterSeconds: null,
    maxSeconds: null,
    duration: null
  };
}
function audioMaxSeconds(quota) {
  if (!quotaApplies(quota)) return null;
  return num(quota.audio.max_seconds);
}
var AUDIO_DURATION_GRACE_SECONDS = 1;
function audioTooLong(durationSec, maxSeconds, owner) {
  if (maxSeconds == null || !(durationSec > maxSeconds + AUDIO_DURATION_GRACE_SECONDS)) return null;
  return {
    code: "audio_too_long",
    kind: "audio",
    status: 413,
    message: `Free accounts can upload audio up to ${formatLength(maxSeconds)} long. 3Speak Pro removes this limit.`,
    upgradeUrl: defaultUpgradeUrl(owner),
    limit: null,
    used: null,
    nextAt: null,
    retryAfterSeconds: null,
    maxSeconds,
    duration: durationSec
  };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  AUDIO_DURATION_GRACE_SECONDS,
  AUDIO_SERVICE_BASE,
  EMBED_SERVICE_BASE,
  UploadLimitError,
  audioMaxSeconds,
  audioTooLong,
  blockedByQuota,
  defaultUpgradeUrl,
  fetchAudioQuota,
  fetchVideoQuota,
  formatLength,
  formatNextSlot,
  formatUploadLimitMessage,
  isUploadLimitError,
  parseUploadLimit,
  quotaApplies,
  readUploadLimit,
  uploadLimitFromTusError
});
//# sourceMappingURL=limits.js.map