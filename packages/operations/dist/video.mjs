// src/video.ts
var SERVICE_BASE = "https://embed.3speak.tv";
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
    throw new Error(`Failed to issue upload token: ${response.status} ${response.statusText}`);
  }
  return response.json();
}
async function uploadVideoTo3Speak(file, options) {
  const { token, upload_url, embed_url } = await issueUploadToken(options);
  const tus = await import("tus-js-client");
  return new Promise((resolve, reject) => {
    const MB = 1024 * 1024;
    const fileSize = file.size;
    const chunkSize = fileSize < 50 * MB ? 5 * MB : fileSize < 500 * MB ? 10 * MB : 20 * MB;
    const parallelUploads = fileSize < 50 * MB ? 2 : 3;
    const upload = new tus.Upload(file, {
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
        reject(error);
      },
      onProgress: (bytesUploaded, bytesTotal) => {
        const percentage = bytesUploaded / bytesTotal * 100;
        options.onProgress?.(Math.round(percentage), "uploading");
      },
      onSuccess: () => {
        options.onProgress?.(100, "complete");
        resolve({
          embedUrl: embed_url,
          videoId: extractVideoIdFromEmbedUrl(embed_url) ?? ""
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
  const [videoResult, thumbnailBlob] = await Promise.all([
    uploadVideoTo3Speak(file, options),
    extractVideoThumbnail(file).catch(() => null)
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
  extractVideoIdFromEmbedUrl,
  extractVideoThumbnail,
  set3SpeakThumbnail,
  uploadToIPFS,
  uploadVideoTo3Speak,
  uploadVideoWithThumbnail
};
//# sourceMappingURL=video.mjs.map