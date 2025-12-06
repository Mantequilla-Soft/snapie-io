# @snapie/renderer

Render Hive blockchain markdown content to sanitized HTML.

## Features

- ✅ Standard Markdown (CommonMark)
- ✅ 3Speak video embeds (all URL formats)
- ✅ IPFS content with multi-gateway fallback
- ✅ YouTube, Vimeo embeds
- ✅ Twitter/X embeds (tweets)
- ✅ Instagram embeds (posts, reels)
- ✅ Hive user mentions (@username → profile links)
- ✅ Community and post link conversion
- ✅ DOMPurify sanitization
- ✅ TypeScript support

## Installation

```bash
pnpm add @snapie/renderer
```

## Quick Start

```typescript
import { renderHiveMarkdown } from '@snapie/renderer';

const html = renderHiveMarkdown(`
# Hello Hive!

Check out @skatehive's latest video:
https://3speak.tv/watch?v=skatehive/abcd1234

![Cool pic](https://ipfs.io/ipfs/QmXxxYyyZzz...)
`);

document.getElementById('content').innerHTML = html;
```

## API Reference

### `renderHiveMarkdown(markdown: string): string`

Render markdown with default settings.

```typescript
const html = renderHiveMarkdown('**Bold** and *italic*');
```

### `createHiveRenderer(options?: HiveRendererOptions): HiveRenderer`

Create a configured renderer instance.

```typescript
import { createHiveRenderer } from '@snapie/renderer';

const renderer = createHiveRenderer({
  additionalHiveFrontends: ['peakd.com', 'ecency.com'],
  ipfsGateways: ['https://ipfs.mycdn.com', 'https://ipfs.3speak.tv'],
  sanitize: true
});

const html = renderer.render(markdown);
```

## Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `additionalHiveFrontends` | `string[]` | `[]` | Additional domains to treat as Hive frontends |
| `ipfsGateways` | `string[]` | See below | IPFS gateways in fallback order |
| `sanitize` | `boolean` | `true` | Enable DOMPurify sanitization |

### Default IPFS Gateways

```typescript
[
  'https://ipfs.3speak.tv',
  'https://ipfs.skatehive.app', 
  'https://cf-ipfs.com',
  'https://dweb.link'
]
```

## IPFS Fallback

Video elements automatically get multiple `<source>` tags:

```html
<video controls>
  <source src="https://ipfs.3speak.tv/ipfs/Qm..." type="video/mp4">
  <source src="https://ipfs.skatehive.app/ipfs/Qm..." type="video/mp4">
  <source src="https://cf-ipfs.com/ipfs/Qm..." type="video/mp4">
</video>
```

The browser automatically tries each source until one works.

## 3Speak URL Support

All these formats are automatically converted to embedded players:

```
https://3speak.tv/watch?v=user/permlink
https://3speak.online/watch?v=user/permlink
https://app.3speak.tv/watch?v=user/permlink
[](https://3speak.tv/watch?v=user/permlink)
```

## Twitter/X Embeds

Tweets are automatically embedded when you include Twitter or X.com URLs:

```markdown
Check out this tweet:
https://twitter.com/username/status/1234567890

Also works with X.com:
https://x.com/username/status/1234567890
```

Both linked URLs (`<a href="...">`) and plain URLs are converted to embedded iframes.

## Instagram Embeds

Instagram posts, reels, and TV videos are automatically embedded:

```markdown
Great post:
https://instagram.com/p/ABC123xyz/

Cool reel:
https://instagram.com/reel/XYZ789abc/
```

Supported URL formats:
- `instagram.com/p/CODE/` - Posts
- `instagram.com/reel/CODE/` - Reels  
- `instagram.com/tv/CODE/` - IGTV videos

## TypeScript

```typescript
import type { HiveRendererOptions, HiveRenderer } from '@snapie/renderer';

const options: HiveRendererOptions = {
  additionalHiveFrontends: ['myapp.io'],
  ipfsGateways: ['https://ipfs.myapp.io']
};
```

## License

MIT
