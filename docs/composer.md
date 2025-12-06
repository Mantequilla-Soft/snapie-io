# @snapie/composer

Build Hive blockchain operations for posts, comments, and media uploads.

## Features

- ✅ Auth-agnostic (works with Keychain, HiveSigner, HiveAuth, Aioha, etc.)
- ✅ Modular design (core, video, audio)
- ✅ Automatic permlink generation
- ✅ Hashtag extraction
- ✅ Beneficiary management
- ✅ 3Speak video/audio uploads (optional)
- ✅ TypeScript support

## Installation

```bash
# Core only (no external dependencies)
pnpm add @snapie/composer

# With video/audio support
pnpm add @snapie/composer tus-js-client
```

## Module Structure

| Import | Description | Dependencies |
|--------|-------------|--------------|
| `@snapie/composer` | Core utilities | None |
| `@snapie/composer/core` | Same as above | None |
| `@snapie/composer/video` | 3Speak video uploads | `tus-js-client` |
| `@snapie/composer/audio` | 3Speak audio uploads | `tus-js-client` |

## Quick Start

```typescript
import { createComposer } from '@snapie/composer';

// Create configured composer
const composer = createComposer({
  appName: 'my-app',
  defaultTags: ['my-app'],
  beneficiaries: [{ account: 'my-app', weight: 500 }] // 5%
});

// Build a post
const result = composer.build({
  author: 'username',
  body: 'Hello #hive! 🚀',
  title: 'My First Post',
  parentAuthor: '',
  parentPermlink: 'hive-123456'
});

// Broadcast with ANY auth method
await keychain.broadcast(result.operations);
// or: await hivesigner.broadcast(result.operations);
// or: await aioha.signAndBroadcastTx(result.operations, KeyTypes.Posting);
```

## API Reference

### `createComposer(config?: ComposerConfig)`

Create a configured composer instance.

```typescript
interface ComposerConfig {
  appName?: string;           // Default: 'snapie'
  defaultTags?: string[];     // Added to all posts
  beneficiaries?: Beneficiary[];  // Default beneficiaries
}

interface Beneficiary {
  account: string;
  weight: number;  // Basis points: 100 = 1%, 1000 = 10%
}
```

### `composer.build(input: CommentInput): ComposerResult`

Build operations for a post or comment.

```typescript
interface CommentInput {
  author: string;              // Required: Hive username
  body: string;                // Required: Post content
  parentAuthor: string;        // Required: '' for posts, author for replies
  parentPermlink: string;      // Required: Community tag or parent permlink
  
  // Optional
  title?: string;              // Post title (empty for comments)
  permlink?: string;           // Custom permlink (auto-generated if omitted)
  tags?: string[];             // Additional tags
  images?: string[];           // Image URLs to append
  gifUrl?: string;             // GIF URL to append
  videoEmbedUrl?: string;      // Video embed URL
  audioEmbedUrl?: string;      // Audio embed URL
  beneficiaries?: Beneficiary[];  // Override default beneficiaries
  metadata?: Record<string, unknown>;  // Custom metadata fields
  
  // Payout options
  maxAcceptedPayout?: string;  // Default: '1000000.000 HBD'
  percentHbd?: number;         // Default: 10000 (100%)
  allowVotes?: boolean;        // Default: true
  allowCurationRewards?: boolean;  // Default: true
}

interface ComposerResult {
  operations: Operation[];     // Ready to broadcast
  permlink: string;            // Generated/provided permlink
  body: string;                // Final body with media appended
  metadata: Record<string, unknown>;  // json_metadata object
}
```

## Examples

### Top-Level Post

```typescript
const result = composer.build({
  author: 'alice',
  body: 'Check out this amazing sunset! #photography #nature',
  title: 'Beautiful Sunset',
  parentAuthor: '',
  parentPermlink: 'hive-194913',  // Photography community
  images: ['https://images.hive.blog/sunset.jpg'],
  tags: ['sunset', 'landscape']
});
```

### Reply to a Post

```typescript
const reply = composer.build({
  author: 'bob',
  body: 'Wow, stunning shot! 📸',
  parentAuthor: 'alice',
  parentPermlink: 'beautiful-sunset-123456'
});
```

### Short-form Post (Snap)

```typescript
const snap = composer.build({
  author: 'charlie',
  body: 'Just shipped a new feature! 🚀 #buildinpublic',
  parentAuthor: '',
  parentPermlink: 'snapie'
});
```

### Post with Custom Beneficiaries

```typescript
const result = composer.build({
  author: 'alice',
  body: 'Collaboration post!',
  title: 'Our Joint Project',
  parentAuthor: '',
  parentPermlink: 'hive-123456',
  beneficiaries: [
    { account: 'bob', weight: 2500 },    // 25%
    { account: 'charlie', weight: 2500 } // 25%
  ]
});
```

## Utility Functions

```typescript
import {
  generatePermlink,
  extractHashtags,
  imageToMarkdown,
  imagesToMarkdown,
  appendMediaToBody,
  buildCommentOperation,
  buildCommentOptionsOperation
} from '@snapie/composer';

// Generate unique permlink
generatePermlink();
// → '20231205t143052789z'

// Extract hashtags
extractHashtags('Hello #hive and #crypto!');
// → ['hive', 'crypto']

// Image to markdown
imageToMarkdown('https://example.com/img.jpg');
// → '![image](https://example.com/img.jpg)'

// Multiple images
imagesToMarkdown(['https://a.jpg', 'https://b.jpg']);
// → '![image](https://a.jpg)\n![image](https://b.jpg)'

// Append media to body
appendMediaToBody('My content', {
  images: ['https://img.jpg'],
  videoEmbedUrl: 'https://3speak.tv/watch?v=...'
});
// → 'My content\n\nhttps://3speak.tv/watch?v=...\n\n![image](https://img.jpg)'
```

## Video Module

```typescript
import { uploadVideoTo3Speak, extractVideoThumbnail } from '@snapie/composer/video';

// Extract thumbnail
const thumbnail = await extractVideoThumbnail(videoFile);

// Upload to 3Speak
const embedUrl = await uploadVideoTo3Speak({
  file: videoFile,
  username: 'hiveuser',
  accessToken: 'your-3speak-token',
  onProgress: (percent) => console.log(`${percent}%`),
  onError: (err) => console.error(err)
});

// Use in post
const result = composer.build({
  author: 'hiveuser',
  body: 'Check out my video!',
  videoEmbedUrl: embedUrl,
  parentAuthor: '',
  parentPermlink: 'threespeak'
});
```

## Audio Module

```typescript
import { uploadAudioTo3Speak, createAudioRecorder } from '@snapie/composer/audio';

// Record audio
const recorder = createAudioRecorder({
  onStop: async (blob) => {
    const embedUrl = await uploadAudioTo3Speak({
      file: new File([blob], 'recording.webm'),
      username: 'hiveuser',
      accessToken: 'token'
    });
    console.log('Uploaded:', embedUrl);
  }
});

await recorder.start();
// ... recording ...
recorder.stop();
```

## TypeScript Types

```typescript
import type {
  ComposerConfig,
  ComposerResult,
  CommentInput,
  Beneficiary,
  Operation
} from '@snapie/composer';

import type {
  VideoUploadOptions
} from '@snapie/composer/video';

import type {
  AudioUploadOptions,
  AudioRecorderOptions
} from '@snapie/composer/audio';
```

## Beneficiary Weight Reference

| Weight | Percentage |
|--------|------------|
| 100 | 1% |
| 250 | 2.5% |
| 500 | 5% |
| 1000 | 10% |
| 2500 | 25% |
| 5000 | 50% |
| 10000 | 100% |

**Note:** Beneficiaries are automatically sorted alphabetically by account (required by Hive).

## License

MIT
