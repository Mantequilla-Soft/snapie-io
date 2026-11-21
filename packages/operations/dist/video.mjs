// src/limits.ts
var EMBED_SERVICE_BASE = "https://embed.3speak.tv";
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

// src/video.ts
var SERVICE_BASE = EMBED_SERVICE_BASE;
var PLAYBACK_API_BASE = "https://play.3speak.tv";
var READY_POLL_INTERVAL_MS = 3e3;
var READY_POLL_TIMEOUT_MS = 12e4;
async function waitForVideoReady(owner, videoId) {
  const deadline = Date.now() + READY_POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const outcome = await fetch(`${PLAYBACK_API_BASE}/api/embed?v=${owner}/${videoId}`).then(async (res) => {
      if (!res.ok) return { ready: false };
      const data = await res.json();
      if (!data.error && data.videoUrl) return { ready: true };
      if (data.status === "error" || data.status === "failed") {
        return { ready: false, failure: data.error || "Video processing failed on 3Speak." };
      }
      return { ready: false };
    }).catch(() => ({ ready: false }));
    if (outcome.ready) return;
    if ("failure" in outcome) throw new Error(outcome.failure);
    await new Promise((r) => setTimeout(r, READY_POLL_INTERVAL_MS));
  }
  throw new Error("Video is taking longer than usual to process. It may still appear shortly \u2014 check back in a minute before trying again.");
}
var bufferedFiles = /* @__PURE__ */ new WeakSet();
var MAX_BUFFER_BYTES = 200 * 1024 * 1024;
function seekTo(video, time) {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(t);
      video.removeEventListener("seeked", finish);
      video.removeEventListener("error", finish);
      resolve();
    };
    const t = setTimeout(finish, 2e3);
    video.addEventListener("seeked", finish, { once: true });
    video.addEventListener("error", finish, { once: true });
    video.currentTime = time;
  });
}
async function warmUpVideoFile(file) {
  const t0 = Date.now();
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.setAttribute("playsinline", "true");
  video.setAttribute("webkit-playsinline", "true");
  video.style.position = "fixed";
  video.style.top = "-9999px";
  video.style.width = "1px";
  video.style.height = "1px";
  const cleanup = () => {
    URL.revokeObjectURL(url);
    video.remove();
  };
  const loadedOrErrored = new Promise((resolve) => {
    video.addEventListener("loadedmetadata", () => resolve("loadedmetadata"), { once: true });
    video.addEventListener("error", () => resolve("error"), { once: true });
  });
  const overallTimeout = new Promise((resolve) => setTimeout(() => resolve("timeout"), 3e4));
  video.src = url;
  document.body.appendChild(video);
  const outcome = await Promise.race([loadedOrErrored, overallTimeout]);
  if (outcome !== "loadedmetadata" || !isFinite(video.duration) || video.duration <= 0) {
    cleanup();
    console.log(`[video-buffer] warm-up finished: ${outcome} after ${Date.now() - t0}ms (no scrub \u2014 no usable duration)`);
    return;
  }
  const SEEK_POINTS = 10;
  const duration = video.duration;
  for (let i = 0; i <= SEEK_POINTS; i++) {
    if (Date.now() - t0 > 3e4) break;
    const target = Math.min(duration * i / SEEK_POINTS, Math.max(duration - 0.05, 0));
    await seekTo(video, target);
  }
  cleanup();
  console.log(`[video-buffer] warm-up finished: scrubbed ${SEEK_POINTS + 1} points across ${duration.toFixed(1)}s after ${Date.now() - t0}ms`);
}
var READ_CHUNK_BYTES = 2 * 1024 * 1024;
var READ_RETRIES = 2;
async function readChunkWithRetry(file, start, end) {
  for (let attempt = 0; ; attempt++) {
    const t0 = Date.now();
    try {
      const buf = await file.slice(start, end).arrayBuffer();
      console.log(`[video-buffer] chunk ${start}-${end} ok on attempt ${attempt + 1} (${Date.now() - t0}ms, ${buf.byteLength}B)`);
      return buf;
    } catch (err) {
      const name = err instanceof DOMException ? err.name : err instanceof Error ? err.constructor.name : typeof err;
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`[video-buffer] chunk ${start}-${end} FAILED attempt ${attempt + 1} after ${Date.now() - t0}ms: ${name}: ${msg}`);
      if (attempt >= READ_RETRIES) throw err;
      await new Promise((r) => setTimeout(r, 300));
    }
  }
}
async function bufferFileInMemory(file) {
  if (bufferedFiles.has(file) || file.size > MAX_BUFFER_BYTES) return file;
  console.log(`[video-buffer] start: name=${file.name} size=${file.size} type=${JSON.stringify(file.type)} lastModified=${file.lastModified}`);
  await warmUpVideoFile(file);
  const chunks = [];
  const t0 = Date.now();
  try {
    for (let start = 0; start < file.size; start += READ_CHUNK_BYTES) {
      chunks.push(await readChunkWithRetry(file, start, Math.min(start + READ_CHUNK_BYTES, file.size)));
    }
    if (chunks.length === 0 && file.size > 0) throw new Error("no chunks read");
    console.log(`[video-buffer] all ${chunks.length} chunks read in ${Date.now() - t0}ms`);
  } catch (err) {
    console.log(`[video-buffer] gave up after ${Date.now() - t0}ms, ${chunks.length} chunks read:`, err);
    throw new Error(
      "Couldn't read the selected video. On Android this usually means the file lives in cloud storage (Google Photos, Drive) rather than on the device \u2014 open it in your gallery to download it locally first, then try again."
    );
  }
  const copy = new File(chunks, file.name, { type: file.type });
  bufferedFiles.add(copy);
  return copy;
}
async function issueUploadToken(options) {
  const response = await fetch(`${SERVICE_BASE}/uploads/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": options.apiKey
    },
    body: JSON.stringify({
      owner: options.owner,
      app: options.appName ?? "snapie",
      short: options.isShort !== false
    })
  });
  if (!response.ok) {
    const limit = await readUploadLimit(response);
    if (limit) throw new UploadLimitError(limit);
    throw new Error(`Failed to issue upload token: ${response.status} ${response.statusText}`);
  }
  return response.json();
}
async function uploadVideoTo3Speak(file, options) {
  const source = await bufferFileInMemory(file);
  const { token, upload_url, embed_url } = await issueUploadToken(options);
  const tus = await import("tus-js-client");
  return new Promise((resolve, reject) => {
    const MB = 1024 * 1024;
    const fileSize = file.size;
    const chunkSize = fileSize < 50 * MB ? 5 * MB : fileSize < 500 * MB ? 10 * MB : 20 * MB;
    const parallelUploads = fileSize < 50 * MB ? 2 : 3;
    const upload = new tus.Upload(source, {
      endpoint: upload_url,
      chunkSize,
      parallelUploads,
      retryDelays: [0, 3e3, 5e3, 1e4, 2e4],
      metadata: {
        filename: file.name,
        filetype: file.type
        // owner, app, short are bound in the token — no need to repeat them
      },
      headers: {
        "Authorization": `Bearer ${token}`
      },
      onError: (error) => {
        options.onProgress?.(0, "error");
        const limit = uploadLimitFromTusError(error);
        reject(limit ? new UploadLimitError(limit) : error);
      },
      onProgress: (bytesUploaded, bytesTotal) => {
        const percentage = bytesUploaded / bytesTotal * 100;
        options.onProgress?.(Math.round(percentage), "uploading");
      },
      onSuccess: () => {
        options.onProgress?.(100, "processing");
        const videoId = extractVideoIdFromEmbedUrl(embed_url) ?? "";
        waitForVideoReady(options.owner, videoId).then(() => {
          options.onProgress?.(100, "complete");
          resolve({ embedUrl: embed_url, videoId });
        }).catch((err) => {
          options.onProgress?.(0, "error");
          reject(err);
        });
      }
    });
    upload.start();
  });
}
function extractVideoIdFromEmbedUrl(embedUrl) {
  try {
    const url = new URL(embedUrl);
    const videoParam = url.searchParams.get("v");
    if (videoParam) {
      const parts = videoParam.split("/");
      return parts[1] ?? null;
    }
    return null;
  } catch {
    return null;
  }
}
async function set3SpeakThumbnail(videoId, thumbnailUrl, apiKey) {
  const response = await fetch(`https://embed.3speak.tv/video/${videoId}/thumbnail`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": apiKey
    },
    body: JSON.stringify({ thumbnail_url: thumbnailUrl })
  });
  if (!response.ok) {
    throw new Error(`Failed to set thumbnail: ${response.status} - ${response.statusText}`);
  }
}
async function extractVideoThumbnail(file, seekTime = 0.5) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.setAttribute("playsinline", "true");
    video.setAttribute("webkit-playsinline", "true");
    video.style.position = "fixed";
    video.style.top = "-9999px";
    video.style.width = "1px";
    video.style.height = "1px";
    video.src = url;
    document.body.appendChild(video);
    const cleanup = () => {
      URL.revokeObjectURL(url);
      video.remove();
    };
    video.addEventListener("loadedmetadata", () => {
      const target = Math.min(seekTime, Math.max((video.duration || seekTime) - 0.05, 0));
      video.play().catch(() => {
      }).finally(() => {
        video.pause();
        video.currentTime = target;
      });
    });
    video.addEventListener("seeked", () => {
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        cleanup();
        reject(new Error("Failed to get canvas context"));
        return;
      }
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        (blob) => {
          cleanup();
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error("Failed to create thumbnail blob"));
          }
        },
        "image/jpeg",
        0.9
      );
    });
    video.addEventListener("error", () => {
      cleanup();
      reject(new Error("Failed to load video"));
    });
    video.load();
  });
}
async function uploadToIPFS(file, endpoint = "http://65.21.201.94:5002/api/v0/add") {
  const formData = new FormData();
  formData.append("file", file);
  const response = await fetch(endpoint, {
    method: "POST",
    body: formData
  });
  if (!response.ok) {
    throw new Error(`IPFS upload failed: ${response.status} - ${response.statusText}`);
  }
  const responseText = await response.text();
  const lines = responseText.trim().split("\n");
  const lastLine = lines[lines.length - 1];
  const result = JSON.parse(lastLine);
  return `https://ipfs.3speak.tv/ipfs/${result.Hash}`;
}
async function uploadVideoWithThumbnail(file, options) {
  const source = await bufferFileInMemory(file);
  const [videoResult, thumbnailBlob] = await Promise.all([
    uploadVideoTo3Speak(source, options),
    extractVideoThumbnail(source).catch(() => null)
  ]);
  let thumbnailUrl;
  if (thumbnailBlob) {
    try {
      thumbnailUrl = options.uploadThumbnail ? await options.uploadThumbnail(thumbnailBlob) : await uploadToIPFS(thumbnailBlob);
      if (videoResult.videoId) {
        await set3SpeakThumbnail(videoResult.videoId, thumbnailUrl, options.apiKey);
      }
    } catch (error) {
      console.warn("Thumbnail processing failed (video still works):", error);
    }
  }
  return {
    ...videoResult,
    thumbnailUrl
  };
}
export {
  UploadLimitError,
  blockedByQuota,
  bufferFileInMemory,
  extractVideoIdFromEmbedUrl,
  extractVideoThumbnail,
  fetchVideoQuota,
  formatUploadLimitMessage,
  isUploadLimitError,
  set3SpeakThumbnail,
  uploadToIPFS,
  uploadVideoTo3Speak,
  uploadVideoWithThumbnail
};
//# sourceMappingURL=video.mjs.map