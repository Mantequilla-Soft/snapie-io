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
  appendMediaToBody: () => appendMediaToBody,
  buildCommentOperation: () => buildCommentOperation,
  buildCommentOptionsOperation: () => buildCommentOptionsOperation,
  createSnapComposer: () => createSnapComposer,
  extractHashtags: () => extractHashtags,
  extractVideoIdFromEmbedUrl: () => extractVideoIdFromEmbedUrl,
  extractVideoThumbnail: () => extractVideoThumbnail,
  generatePermlink: () => generatePermlink,
  imageToMarkdown: () => imageToMarkdown,
  imagesToMarkdown: () => imagesToMarkdown,
  set3SpeakThumbnail: () => set3SpeakThumbnail,
  uploadToIPFS: () => uploadToIPFS,
  uploadVideoTo3Speak: () => uploadVideoTo3Speak
});
module.exports = __toCommonJS(index_exports);
function generatePermlink() {
  return (/* @__PURE__ */ new Date()).toISOString().replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
}
function extractHashtags(text) {
  const hashtagRegex = /#(\w+)/g;
  const matches = text.match(hashtagRegex) || [];
  return matches.map((hashtag) => hashtag.slice(1));
}
function imageToMarkdown(url) {
  return `![image](${url})`;
}
function imagesToMarkdown(urls) {
  return urls.map(imageToMarkdown).join("\n");
}
function appendMediaToBody(body, options) {
  let result = body;
  if (options.videoEmbedUrl) {
    result += `

${options.videoEmbedUrl}`;
  }
  if (options.audioEmbedUrl) {
    result += `

${options.audioEmbedUrl}`;
  }
  if (options.images && options.images.length > 0) {
    result += `

${imagesToMarkdown(options.images)}`;
  }
  if (options.gifUrl) {
    result += `

![gif](${options.gifUrl})`;
  }
  return result;
}
function buildCommentOperation(input) {
  return [
    "comment",
    {
      parent_author: input.parentAuthor,
      parent_permlink: input.parentPermlink,
      author: input.author,
      permlink: input.permlink,
      title: input.title,
      body: input.body,
      json_metadata: JSON.stringify(input.metadata)
    }
  ];
}
function buildCommentOptionsOperation(input) {
  const extensions = [];
  if (input.beneficiaries && input.beneficiaries.length > 0) {
    const sortedBeneficiaries = [...input.beneficiaries].sort(
      (a, b) => a.account.localeCompare(b.account)
    );
    extensions.push([0, { beneficiaries: sortedBeneficiaries }]);
  }
  return [
    "comment_options",
    {
      author: input.author,
      permlink: input.permlink,
      max_accepted_payout: input.maxAcceptedPayout ?? "1000000.000 HBD",
      percent_hbd: input.percentHbd ?? 1e4,
      allow_votes: input.allowVotes ?? true,
      allow_curation_rewards: input.allowCurationRewards ?? true,
      extensions
    }
  ];
}
async function uploadVideoTo3Speak(file, options) {
  const tus = await import("tus-js-client");
  return new Promise((resolve, reject) => {
    let embedUrl = null;
    const upload = new tus.Upload(file, {
      endpoint: "https://embed.3speak.tv/uploads",
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
var DEFAULT_OPTIONS = {
  appName: "snapie",
  defaultTags: [],
  requireBeneficiariesOnVideo: false
};
function createSnapComposer(options = {}) {
  const config = { ...DEFAULT_OPTIONS, ...options };
  return {
    /**
     * Build operations for a comment/post
     */
    buildOperations(input) {
      const permlink = input.permlink ?? generatePermlink();
      const body = appendMediaToBody(input.body, {
        images: input.images,
        gifUrl: input.gifUrl,
        videoEmbedUrl: input.videoEmbedUrl,
        audioEmbedUrl: input.audioEmbedUrl
      });
      const extractedTags = extractHashtags(body);
      const allTags = [.../* @__PURE__ */ new Set([
        ...config.defaultTags,
        ...input.tags ?? [],
        ...extractedTags
      ])];
      const metadata = {
        app: config.appName,
        tags: allTags,
        ...input.images && input.images.length > 0 ? { images: input.images } : {},
        ...input.metadata
      };
      const commentOp = buildCommentOperation({
        parentAuthor: input.parentAuthor,
        parentPermlink: input.parentPermlink,
        author: input.author,
        permlink,
        title: input.title ?? "",
        body,
        metadata
      });
      const operations = [commentOp];
      const beneficiaries = input.beneficiaries ?? config.beneficiaries;
      const hasCustomPayoutSettings = input.maxAcceptedPayout !== void 0 || input.percentHbd !== void 0 || input.allowVotes !== void 0 || input.allowCurationRewards !== void 0;
      const needsBeneficiaries = beneficiaries && beneficiaries.length > 0;
      const requiresBeneficiaries = config.requireBeneficiariesOnVideo && input.videoEmbedUrl;
      if (needsBeneficiaries || hasCustomPayoutSettings || requiresBeneficiaries) {
        const optionsOp = buildCommentOptionsOperation({
          author: input.author,
          permlink,
          maxAcceptedPayout: input.maxAcceptedPayout,
          percentHbd: input.percentHbd,
          allowVotes: input.allowVotes,
          allowCurationRewards: input.allowCurationRewards,
          beneficiaries: needsBeneficiaries ? beneficiaries : void 0
        });
        operations.push(optionsOp);
      }
      return {
        operations,
        permlink,
        body,
        metadata
      };
    },
    /**
     * Upload a video to 3Speak
     */
    async uploadVideo(file, owner, onProgress) {
      if (!config.threeSpeakApiKey) {
        throw new Error("3Speak API key not configured");
      }
      return uploadVideoTo3Speak(file, {
        apiKey: config.threeSpeakApiKey,
        owner,
        appName: config.appName,
        onProgress
      });
    },
    /**
     * Extract and upload a video thumbnail
     */
    async uploadThumbnail(videoFile, uploadFn) {
      const thumbnailBlob = await extractVideoThumbnail(videoFile);
      if (uploadFn) {
        return uploadFn(thumbnailBlob);
      }
      return uploadToIPFS(
        thumbnailBlob,
        config.ipfsUploadEndpoint
      );
    },
    /**
     * Set video thumbnail via 3Speak API
     */
    async setVideoThumbnail(videoId, thumbnailUrl) {
      if (!config.threeSpeakApiKey) {
        throw new Error("3Speak API key not configured");
      }
      return set3SpeakThumbnail(videoId, thumbnailUrl, config.threeSpeakApiKey);
    },
    /**
     * Upload images (requires uploadImage function in config)
     */
    async uploadImages(files, onProgress) {
      if (!config.uploadImage) {
        throw new Error("uploadImage function not configured");
      }
      const results = [];
      for (let i = 0; i < files.length; i++) {
        const url = await config.uploadImage(
          files[i],
          (progress) => onProgress?.(i, progress)
        );
        results.push(url);
      }
      return results;
    }
  };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  appendMediaToBody,
  buildCommentOperation,
  buildCommentOptionsOperation,
  createSnapComposer,
  extractHashtags,
  extractVideoIdFromEmbedUrl,
  extractVideoThumbnail,
  generatePermlink,
  imageToMarkdown,
  imagesToMarkdown,
  set3SpeakThumbnail,
  uploadToIPFS,
  uploadVideoTo3Speak
});
//# sourceMappingURL=index.js.map