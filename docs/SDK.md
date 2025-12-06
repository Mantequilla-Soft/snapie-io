# Snapie SDK Documentation

The Snapie SDK provides two packages for building Hive blockchain applications:

- **@snapie/renderer** - Render Hive markdown content to HTML
- **@snapie/composer** - Build and compose Hive blockchain operations

Both packages are designed to be **auth-agnostic** - they don't care how you authenticate users. You provide the operations, and broadcast them with your preferred auth method (Keychain, HiveSigner, HiveAuth, etc.).

---

## Table of Contents

1. [Installation](#installation)
2. [@snapie/renderer](#snapierenderer)
   - [Basic Usage](#basic-usage)
   - [Configuration Options](#configuration-options)
   - [IPFS Gateway Fallback](#ipfs-gateway-fallback)
   - [3Speak Video Handling](#3speak-video-handling)
3. [@snapie/composer](#snapiecomposer)
   - [Core Module](#core-module)
   - [Video Module (Optional)](#video-module-optional)
   - [Audio Module (Optional)](#audio-module-optional)
4. [Full Examples](#full-examples)
5. [TypeScript Support](#typescript-support)

---

## Installation

```bash
# Using pnpm
pnpm add @snapie/renderer @snapie/composer

# Using npm
npm install @snapie/renderer @snapie/composer

# Using yarn
yarn add @snapie/renderer @snapie/composer
```

**Note:** The composer package has optional peer dependencies for video/audio features:

```bash
# For video/audio upload support
pnpm add tus-js-client
```

---

## @snapie/renderer

The renderer package converts Hive markdown content into sanitized HTML, handling:

- Standard markdown (bold, italic, lists, code blocks, etc.)
- 3Speak video embeds (legacy and modern URLs)
- IPFS content with multi-gateway fallback
- YouTube, Vimeo, and other video embeds
- **Twitter/X tweet embeds**
- **Instagram post/reel embeds**
- Hive user mentions (@username)
- Community/post links
- Image optimization

### Basic Usage

```typescript
import { renderHiveMarkdown } from '@snapie/renderer';

const markdown = `
# Hello Hive!

Check out this video: https://3speak.tv/watch?v=username/permlink

And this image: ![photo](https://ipfs.io/ipfs/QmXxx...)

Follow @skatehive for more content!
`;

const html = renderHiveMarkdown(markdown);
// Returns sanitized HTML with embedded video player, IPFS image, and linked username
```

### Configuration Options

```typescript
import { createHiveRenderer } from '@snapie/renderer';

const renderer = createHiveRenderer({
  // Add your frontend to convert Hive links
  additionalHiveFrontends: ['myapp.io', 'peakd.com'],
  
  // Custom IPFS gateways (with fallback order)
  ipfsGateways: [
    'https://ipfs.myapp.io',
    'https://ipfs.3speak.tv',
    'https://cf-ipfs.com'
  ],
  
  // Enable/disable features
  sanitize: true,           // DOMPurify sanitization (default: true)
  convertYouTube: true,     // Convert YouTube URLs to embeds
  convert3Speak: true,      // Convert 3Speak URLs to embeds
});

const html = renderer.render(markdown);
```

### IPFS Gateway Fallback

The renderer automatically handles IPFS content with multiple gateway fallback:

```typescript
import { renderHiveMarkdown } from '@snapie/renderer';

// Default gateways (in fallback order):
// 1. https://ipfs.3speak.tv
// 2. https://ipfs.skatehive.app
// 3. https://cf-ipfs.com
// 4. https://dweb.link

const markdown = '![image](https://ipfs.io/ipfs/QmXxxYyyZzz)';
const html = renderHiveMarkdown(markdown);

// Video elements get multiple <source> tags for automatic fallback:
// <video controls>
//   <source src="https://ipfs.3speak.tv/ipfs/QmXxx" type="video/mp4">
//   <source src="https://ipfs.skatehive.app/ipfs/QmXxx" type="video/mp4">
//   <source src="https://cf-ipfs.com/ipfs/QmXxx" type="video/mp4">
//   ...
// </video>
```

Custom IPFS gateways:

```typescript
import { createHiveRenderer } from '@snapie/renderer';

const renderer = createHiveRenderer({
  ipfsGateways: [
    'https://my-ipfs-gateway.com',
    'https://ipfs.3speak.tv',
    'https://dweb.link'
  ]
});
```

### 3Speak Video Handling

The renderer automatically converts 3Speak URLs to embedded players:

```typescript
// All these formats are supported:
const markdown = `
https://3speak.tv/watch?v=username/permlink
https://3speak.online/watch?v=username/permlink
[](https://3speak.tv/watch?v=username/permlink)
`;

// Converts to responsive iframe embed
```

---

## @snapie/composer

The composer package helps you build Hive blockchain operations. It's **modular** - you only import what you need:

- `@snapie/composer` or `@snapie/composer/core` - Core utilities (no external deps)
- `@snapie/composer/video` - 3Speak video uploads (requires `tus-js-client`)
- `@snapie/composer/audio` - 3Speak audio uploads (requires `tus-js-client`)

### Core Module

```typescript
import { createComposer } from '@snapie/composer';

// Create a configured composer
const composer = createComposer({
  appName: 'my-app',              // Shows in json_metadata
  defaultTags: ['my-app'],        // Added to all posts
  beneficiaries: [                // Default beneficiaries
    { account: 'my-app', weight: 500 }  // 5% (weight is basis points)
  ]
});

// Build operations for a post
const result = composer.build({
  author: 'username',
  body: 'Hello Hive! #introduction',
  parentAuthor: '',                    // Empty for top-level posts
  parentPermlink: 'hive-123456',       // Community tag
  title: 'My First Post',              // Optional (empty for comments)
  tags: ['hello', 'newbie'],           // Additional tags
  images: ['https://...'],             // Image URLs to append
  beneficiaries: [                     // Override default beneficiaries
    { account: 'someone', weight: 1000 }
  ]
});

console.log(result);
// {
//   operations: [CommentOperation, CommentOptionsOperation],
//   permlink: '20231205t123456789z',
//   body: 'Hello Hive! #introduction\n\n![image](https://...)',
//   metadata: { app: 'my-app', tags: ['my-app', 'hello', 'newbie', 'introduction'] }
// }

// Broadcast with your auth method
await keychain.broadcast(result.operations);
// or
await hivesigner.broadcast(result.operations);
// or
await aioha.signAndBroadcastTx(result.operations, KeyTypes.Posting);
```

#### Building Comments/Replies

```typescript
const reply = composer.build({
  author: 'username',
  body: 'Great post! 🔥',
  parentAuthor: 'originalAuthor',      // Author of post being replied to
  parentPermlink: 'original-permlink', // Permlink of post being replied to
});

await myAuth.broadcast(reply.operations);
```

#### Utility Functions

```typescript
import { 
  generatePermlink,
  extractHashtags,
  imageToMarkdown,
  appendMediaToBody,
  buildCommentOperation,
  buildCommentOptionsOperation
} from '@snapie/composer';

// Generate unique permlink
const permlink = generatePermlink();
// '20231205t143052123z'

// Extract hashtags from text
const tags = extractHashtags('Hello #hive and #crypto world!');
// ['hive', 'crypto']

// Build image markdown
const imgMd = imageToMarkdown('https://example.com/photo.jpg');
// '![image](https://example.com/photo.jpg)'

// Append media to body
const body = appendMediaToBody('My post content', {
  images: ['https://img1.jpg', 'https://img2.jpg'],
  gifUrl: 'https://giphy.com/...',
  videoEmbedUrl: 'https://3speak.tv/watch?v=...'
});
```

### Video Module (Optional)

**Requires:** `tus-js-client` peer dependency

```typescript
import { uploadVideoTo3Speak, extractVideoThumbnail } from '@snapie/composer/video';

// Extract thumbnail from video file
const thumbnailBlob = await extractVideoThumbnail(videoFile);

// Upload video to 3Speak
const embedUrl = await uploadVideoTo3Speak({
  file: videoFile,
  username: 'hiveuser',
  accessToken: 'threespeak-access-token',
  
  // Optional callbacks
  onProgress: (percentage) => {
    console.log(`Upload: ${percentage}%`);
  },
  onError: (error) => {
    console.error('Upload failed:', error);
  }
});

// Use the embed URL in your post
const result = composer.build({
  author: 'username',
  body: 'Check out my video!',
  parentAuthor: '',
  parentPermlink: 'threespeak',
  videoEmbedUrl: embedUrl
});
```

### Audio Module (Optional)

**Requires:** `tus-js-client` peer dependency

```typescript
import { uploadAudioTo3Speak, createAudioRecorder } from '@snapie/composer/audio';

// Create an audio recorder
const recorder = createAudioRecorder({
  onDataAvailable: (blob) => {
    console.log('Recording chunk:', blob);
  },
  onStop: async (audioBlob) => {
    // Upload when recording stops
    const embedUrl = await uploadAudioTo3Speak({
      file: new File([audioBlob], 'recording.webm'),
      username: 'hiveuser',
      accessToken: 'threespeak-access-token'
    });
    console.log('Audio uploaded:', embedUrl);
  }
});

// Control recording
await recorder.start();
// ... user records audio ...
recorder.stop();
```

---

## Full Examples

### Example 1: Simple Blog Post

```typescript
import { createComposer } from '@snapie/composer';
import { renderHiveMarkdown } from '@snapie/renderer';

const composer = createComposer({
  appName: 'MyBlog',
  beneficiaries: [{ account: 'myblog', weight: 300 }] // 3%
});

async function publishPost(title: string, body: string, tags: string[]) {
  const result = composer.build({
    author: currentUser,
    title,
    body,
    tags,
    parentAuthor: '',
    parentPermlink: 'hive-123456' // Your community
  });
  
  // Preview before publishing
  const preview = renderHiveMarkdown(result.body);
  showPreview(preview);
  
  // Publish
  await keychain.broadcast(result.operations);
  
  return result.permlink;
}
```

### Example 2: Short-form Posts (Snaps)

```typescript
import { createComposer } from '@snapie/composer';

const snapComposer = createComposer({
  appName: 'Snapie.io',
  defaultTags: ['snapie'],
  beneficiaries: [{ account: 'snapie', weight: 300 }]
});

async function postSnap(text: string, images: string[] = []) {
  const result = snapComposer.build({
    author: currentUser,
    body: text,
    images,
    parentAuthor: '',
    parentPermlink: 'snapie' // Snaps go to snapie tag
  });
  
  await aioha.signAndBroadcastTx(result.operations, KeyTypes.Posting);
}
```

### Example 3: Video Post with 3Speak

```typescript
import { createComposer } from '@snapie/composer';
import { uploadVideoTo3Speak, extractVideoThumbnail } from '@snapie/composer/video';

const composer = createComposer({ appName: 'MyVideoApp' });

async function postVideo(videoFile: File, title: string, description: string) {
  // 1. Extract thumbnail
  const thumbnail = await extractVideoThumbnail(videoFile);
  
  // 2. Upload to 3Speak
  const embedUrl = await uploadVideoTo3Speak({
    file: videoFile,
    username: currentUser,
    accessToken: threeSpeakToken,
    onProgress: (p) => updateProgressBar(p)
  });
  
  // 3. Build and broadcast
  const result = composer.build({
    author: currentUser,
    title,
    body: description,
    videoEmbedUrl: embedUrl,
    parentAuthor: '',
    parentPermlink: 'threespeak',
    tags: ['video', '3speak']
  });
  
  await keychain.broadcast(result.operations);
}
```

### Example 4: Reply with Mentions

```typescript
import { createComposer, extractHashtags } from '@snapie/composer';

const composer = createComposer({ appName: 'MyApp' });

async function replyToPost(parentAuthor: string, parentPermlink: string, text: string) {
  const result = composer.build({
    author: currentUser,
    body: text,
    parentAuthor,
    parentPermlink
  });
  
  await hivesigner.broadcast(result.operations);
  
  // Hashtags are auto-extracted
  console.log('Tags:', result.metadata.tags);
}

// Usage
await replyToPost('someuser', 'great-post', 'Love this! #hive #awesome');
```

---

## TypeScript Support

Both packages include full TypeScript definitions:

```typescript
import type {
  HiveRendererOptions,
  HiveRenderer
} from '@snapie/renderer';

import type {
  ComposerConfig,
  ComposerResult,
  CommentInput,
  Beneficiary,
  Operation
} from '@snapie/composer';

// Video types (if using video module)
import type {
  VideoUploadOptions,
  VideoUploadResult
} from '@snapie/composer/video';

// Audio types (if using audio module)
import type {
  AudioUploadOptions,
  AudioRecorderOptions
} from '@snapie/composer/audio';
```

### Beneficiary Weight Reference

| Weight | Percentage |
|--------|------------|
| 100    | 1%         |
| 500    | 5%         |
| 1000   | 10%        |
| 2500   | 25%        |
| 5000   | 50%        |
| 10000  | 100%       |

---

## License

MIT © Snapie.io
