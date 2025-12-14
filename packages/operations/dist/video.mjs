// src/video.ts
async function uploadVideoTo3Speak(file, options) {
  const tus = await import("tus-js-client");
  return new Promise((resolve, reject) => {
    let embedUrl = null;
    const upload = new tus.Upload(file, {
      endpoint: "https://embed.3speak.tv/uploads",
      chunkSize: 10 * 1024 * 1024,
      // 10MB chunks for reliable large file uploads
      retryDelays: [0, 3e3, 5e3, 1e4, 2e4],
      metadata: {
        filename: file.name,
        owner: options.owner,
        frontend_app: options.appName ?? "snapie",
        short: "true"
      },
      headers: {
        "X-API-Key": options.apiKey
      },
      onError: (error) => {
        options.onProgress?.(0, "error");
        reject(error);
      },
      onProgress: (bytesUploaded, bytesTotal) => {
        const percentage = bytesUploaded / bytesTotal * 100;
        options.onProgress?.(Math.round(percentage), "uploading");
      },
      onAfterResponse: (req, res) => {
        const url = res.getHeader("X-Embed-URL");
        if (url) {
          embedUrl = url;
        }
      },
      onSuccess: () => {
        if (embedUrl) {
          options.onProgress?.(100, "complete");
          const videoId = extractVideoIdFromEmbedUrl(embedUrl);
          resolve({
            embedUrl,
            videoId: videoId ?? ""
          });
        } else {
          options.onProgress?.(0, "error");
          reject(new Error("Failed to get embed URL from server"));
        }
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
    video.src = url;
    video.crossOrigin = "anonymous";
    video.muted = true;
    video.addEventListener("loadeddata", () => {
      video.currentTime = seekTime;
    });
    video.addEventListener("seeked", () => {
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Failed to get canvas context"));
        return;
      }
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        (blob) => {
          URL.revokeObjectURL(url);
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
      URL.revokeObjectURL(url);
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