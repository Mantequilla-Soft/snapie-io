# Snapie Composer SDK - Project Plan

## Overview
Create an open-source npm package that provides production-ready Hive blog post composer and renderer components for React applications.

## Package Name
`@snapie/composer` (or `@snapie/hive-composer`)

## Core Philosophy
- **Zero hardcoded beneficiaries** - Developers control everything
- **Framework agnostic** - Works with Next.js, Vite, CRA, etc.
- **TypeScript first** - Full type safety
- **Customizable** - Theming, features, behavior
- **Best practices built-in** - Proper permlinks, metadata, validation

---

## Two-Part SDK Structure

### Part 1: Composer
**What it does:** Create and publish blog posts to Hive

**Components:**
- `<SnapieComposer />` - Main composer interface
- `<Editor />` - Markdown editor with live preview
- `<BeneficiariesInput />` - Beneficiary selector
- `<ImageUploader />` - Drag & drop with compression
- `<HashtagInput />` - Tag management

**Features:**
- ✅ Live markdown preview with DOMPurify sanitization
- ✅ Drag & drop image uploads with compression
- ✅ Hive-compatible permlink generation
- ✅ Beneficiary management (sortable, validated)
- ✅ Community/tag selection
- ✅ Aioha integration (Hive Keychain, HiveAuth, etc.)
- ✅ Image compression (max 1920px width)
- ✅ Form validation
- ✅ Success/error handling

### Part 2: Renderer
**What it does:** Display Hive posts with proper formatting

**Components:**
- `<PostRenderer />` - Render Hive post content
- `<EnhancedMarkdownRenderer />` - Parse Hive markdown
- `<MediaRenderer />` - Display images, videos, embeds
- `<PostCard />` - Compact post preview
- `<PostGrid />` - Grid layout for multiple posts

**Features:**
- ✅ YouTube embed detection
- ✅ 3Speak video embeds
- ✅ Instagram embeds
- ✅ Image galleries
- ✅ Spoiler tags
- ✅ Code syntax highlighting
- ✅ Links with metadata preview
- ✅ Hashtag linking
- ✅ User mention linking (@username)

**Why Include Renderer?**
- **Tied to the hip:** Apps that let users compose posts also need to display them
- **Consistency:** Ensure posts look the same everywhere
- **Complete solution:** One package for entire post lifecycle
- **Proven rendering:** Your EnhancedMarkdownRenderer already handles edge cases

---

## File Structure

```
@snapie/composer/
├── src/
│   ├── composer/
│   │   ├── SnapieComposer.tsx
│   │   ├── Editor.tsx
│   │   ├── BeneficiariesInput.tsx
│   │   ├── ImageUploader.tsx
│   │   └── HashtagInput.tsx
│   ├── renderer/
│   │   ├── PostRenderer.tsx
│   │   ├── EnhancedMarkdownRenderer.tsx
│   │   ├── MediaRenderer.tsx
│   │   ├── PostCard.tsx
│   │   └── PostGrid.tsx
│   ├── hooks/
│   │   ├── useHivePost.ts
│   │   ├── useImageUpload.ts
│   │   ├── useComments.ts
│   │   └── usePosts.ts
│   ├── utils/
│   │   ├── permlink.ts
│   │   ├── validation.ts
│   │   ├── imageCompression.ts
│   │   ├── markdownProcessor.ts
│   │   └── hiveUtils.ts
│   ├── types/
│   │   ├── composer.ts
│   │   ├── renderer.ts
│   │   └── hive.ts
│   └── index.ts
├── package.json
├── tsconfig.json
├── tsup.config.ts
├── README.md
└── LICENSE (MIT)
```

---

## API Design

### Composer Usage

```tsx
import { SnapieComposer } from '@snapie/composer'

function MyBlogApp() {
  return (
    <SnapieComposer
      // Required
      onSuccess={(post) => {
        console.log('Published!', post)
        router.push(`/@${post.author}/${post.permlink}`)
      }}
      
      // Optional - Beneficiaries
      beneficiaries={[
        { account: 'myapp', weight: 500 }  // 5% to your app
      ]}
      defaultBeneficiaries={[
        { account: 'snapie', weight: 300, removable: true }
      ]}
      
      // Optional - Configuration
      community="hive-173115"
      defaultTags={['blog']}
      maxImages={10}
      allowDragDrop={true}
      compressImages={true}
      maxImageWidth={1920}
      
      // Optional - UI
      theme="dark"
      showPreview={true}
      placeholder="What's on your mind?"
      
      // Optional - Callbacks
      onError={(error) => console.error(error)}
      onImageUpload={(url) => console.log('Image uploaded:', url)}
      
      // Optional - Advanced
      customToolbar={<MyToolbar />}
      customValidation={(content) => content.length > 100}
    />
  )
}
```

### Renderer Usage

```tsx
import { PostRenderer, PostCard, PostGrid } from '@snapie/composer'

// Full post view
function PostPage({ post }) {
  return (
    <PostRenderer
      post={post}
      showAuthor={true}
      showDate={true}
      showTags={true}
      enableComments={true}
      theme="dark"
      onUserClick={(username) => router.push(`/@${username}`)}
      onTagClick={(tag) => router.push(`/tag/${tag}`)}
    />
  )
}

// Post preview card
function FeedItem({ post }) {
  return (
    <PostCard
      post={post}
      compact={true}
      showExcerpt={true}
      maxExcerptLength={200}
      onClick={() => router.push(`/@${post.author}/${post.permlink}`)}
    />
  )
}

// Grid of posts
function BlogFeed({ posts }) {
  return (
    <PostGrid
      posts={posts}
      columns={{ base: 1, md: 2, lg: 3 }}
      gap={4}
      loading={isLoading}
      onLoadMore={loadMore}
    />
  )
}
```

---

## Dependencies

### Peer Dependencies (User installs)
```json
{
  "peerDependencies": {
    "react": "^18.0.0",
    "react-dom": "^18.0.0",
    "@chakra-ui/react": "^2.0.0",
    "@aioha/react-ui": "^1.4.0",
    "@aioha/aioha": "^1.5.0"
  }
}
```

### Internal Dependencies (Bundled)
```json
{
  "dependencies": {
    "react-dropzone": "^14.2.3",
    "react-markdown": "^9.0.0",
    "remark-gfm": "^4.0.0",
    "rehype-raw": "^7.0.0",
    "rehype-sanitize": "^6.0.0",
    "dompurify": "^3.0.6",
    "browser-image-compression": "^2.0.2",
    "@hiveio/dhive": "^1.3.1-beta"
  }
}
```

---

## Build Setup

### package.json
```json
{
  "name": "@snapie/composer",
  "version": "1.0.0",
  "description": "Production-ready Hive blog post composer and renderer for React",
  "main": "./dist/index.js",
  "module": "./dist/index.mjs",
  "types": "./dist/index.d.ts",
  "files": ["dist"],
  "keywords": ["hive", "blog", "composer", "editor", "markdown", "web3"],
  "author": "Snapie.io",
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "https://github.com/Mantequilla-Soft/snapie-composer-sdk"
  },
  "scripts": {
    "build": "tsup",
    "dev": "tsup --watch",
    "lint": "tsc --noEmit",
    "prepublishOnly": "npm run build"
  }
}
```

### tsup.config.ts
```ts
import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  external: [
    'react',
    'react-dom',
    '@chakra-ui/react',
    '@aioha/react-ui',
    '@aioha/aioha'
  ],
  banner: {
    js: '"use client";'  // For Next.js App Router compatibility
  }
})
```

---

## TypeScript Types

```typescript
// Composer types
export interface SnapieComposerProps {
  // Required
  onSuccess: (post: HivePost) => void
  
  // Beneficiaries
  beneficiaries?: Beneficiary[]
  defaultBeneficiaries?: Beneficiary[]
  maxBeneficiaries?: number
  
  // Configuration
  community?: string
  defaultTags?: string[]
  maxImages?: number
  maxImageWidth?: number
  allowDragDrop?: boolean
  compressImages?: boolean
  
  // UI
  theme?: 'light' | 'dark' | 'auto'
  showPreview?: boolean
  placeholder?: string
  
  // Callbacks
  onError?: (error: Error) => void
  onImageUpload?: (url: string) => void
  
  // Advanced
  customToolbar?: React.ReactNode
  customValidation?: (content: string) => boolean
}

export interface Beneficiary {
  account: string
  weight: number  // In basis points (300 = 3%)
  locked?: boolean
  removable?: boolean
}

export interface HivePost {
  author: string
  permlink: string
  title: string
  body: string
  category: string
  json_metadata: string
  created: string
  url: string
}

// Renderer types
export interface PostRendererProps {
  post: HivePost | Discussion
  showAuthor?: boolean
  showDate?: boolean
  showTags?: boolean
  enableComments?: boolean
  theme?: 'light' | 'dark' | 'auto'
  onUserClick?: (username: string) => void
  onTagClick?: (tag: string) => void
}

export interface PostCardProps {
  post: HivePost
  compact?: boolean
  showExcerpt?: boolean
  maxExcerptLength?: number
  onClick?: () => void
}
```

---

## Monetization Strategies

### 1. Optional Default Beneficiary (Recommended)
```tsx
<SnapieComposer
  defaultBeneficiaries={[
    { account: 'snapie', weight: 300, removable: true }
  ]}
/>
```
- Shows @snapie as 3% beneficiary by default
- User can remove it if they want
- Most won't (lazy/grateful)
- **Ethical:** Not forced, just suggested

### 2. Attribution Link
```tsx
<SnapieComposer showAttribution={true} />
```
- Shows "Powered by Snapie.io" link
- SEO benefit
- Marketing
- Free version feature

### 3. Premium Features
Free tier:
- Basic composer
- Standard renderer
- 5 images max

Pro tier ($$ or 3% beneficiary):
- Video uploads
- GIF search
- Custom themes
- Unlimited images
- Priority support

### 4. Service Integration
- Offer hosted image CDN
- Offer video encoding (3Speak integration)
- Charge per upload or monthly fee
- SDK makes it easy to use your services

---

## Publishing Process

### One-Time Setup
```bash
# Create npm account (free)
npm adduser

# Login
npm login
```

### Publishing
```bash
# Build
npm run build

# Test locally first
npm link
cd ~/my-test-app
npm link @snapie/composer

# Publish to npm
npm publish --access public

# Update version for next release
npm version patch  # 1.0.0 -> 1.0.1
npm version minor  # 1.0.0 -> 1.1.0
npm version major  # 1.0.0 -> 2.0.0
```

### Distribution Channels
1. **npm registry** - Primary (npm install @snapie/composer)
2. **GitHub** - Source code + releases
3. **Documentation site** - Full guides, examples
4. **Hive blog post** - Announcement with demos
5. **Discord/Telegram** - Share in Hive dev communities

---

## Marketing Strategy

### Launch Announcement
1. **Hive blog post** with video demo
2. **GitHub repository** with star-worthy README
3. **Documentation site** (docs.snapie.io/composer)
4. **Dev communities:**
   - Hive Discord
   - PeakD Discord
   - Ecency Discord
   - HiveDev Telegram

### Content
- "Stop rebuilding Hive blog composers - use this instead"
- Video tutorial on YouTube
- Live coding stream
- Example apps using the SDK

### Growth
- GitHub badges showing downloads/stars
- "Built with Snapie Composer" showcase page
- Community contributions welcome
- Hacktoberfest participation

---

## Files to Extract from Current App

### From `/app/compose/`
- ✅ `page.tsx` → `SnapieComposer.tsx`
- ✅ `Editor.tsx` → Keep as-is

### From `/components/compose/`
- ✅ `BeneficiariesInput.tsx` → Keep as-is

### From `/components/blog/`
- ✅ `EnhancedMarkdownRenderer.tsx` → Keep as-is
- ✅ `PostCard.tsx` → Keep as-is
- ✅ `PostDetails.tsx` → `PostRenderer.tsx`
- ✅ `PostGrid.tsx` → Keep as-is

### From `/lib/utils/`
- ✅ `composeUtils.ts` → Extract functions
- ✅ `MarkdownProcessor.ts` → Keep as-is
- ✅ `extractImageUrls.ts` → Keep as-is

### From `/hooks/`
- ✅ `usePosts.ts` → Keep as-is
- ✅ `useComments.ts` → Keep as-is

---

## Timeline

### Phase 1: Extraction (4-6 hours)
- [ ] Create new repo structure
- [ ] Copy and clean up components
- [ ] Remove Snapie-specific hardcoding
- [ ] Make everything prop-based
- [ ] Add TypeScript types

### Phase 2: Configuration (2-3 hours)
- [ ] Setup tsup build
- [ ] Configure package.json
- [ ] Add peer dependencies
- [ ] Setup TypeScript config
- [ ] Create exports in index.ts

### Phase 3: Testing (2-3 hours)
- [ ] Test in snapie.io (dogfooding)
- [ ] Test in fresh Next.js app
- [ ] Test in Vite app
- [ ] Fix any build issues

### Phase 4: Documentation (3-4 hours)
- [ ] Write comprehensive README
- [ ] Add JSDoc comments
- [ ] Create example projects
- [ ] Record demo video

### Phase 5: Launch (1-2 hours)
- [ ] Publish to npm
- [ ] Create GitHub repo
- [ ] Post on Hive
- [ ] Share in communities

**Total: 12-18 hours of focused work**

---

## Success Metrics

### Short-term (3 months)
- 500+ npm downloads
- 50+ GitHub stars
- 5+ apps using it
- 10+ community contributions

### Long-term (1 year)
- 5,000+ npm downloads
- 200+ GitHub stars
- 20+ apps using it
- Become standard for Hive composers
- Generate passive income from beneficiaries/services

---

## Competitive Advantage

### vs Building from Scratch
- ✅ Save 20-40 hours of development
- ✅ Proven, tested code
- ✅ Best practices built-in
- ✅ Regular updates

### vs Other Hive Tools
- ✅ Modern React (hooks, TypeScript)
- ✅ Full-featured (composer + renderer)
- ✅ Actively maintained
- ✅ Great documentation
- ✅ Community-driven

---

## Future Enhancements

### V2 Features
- [ ] Video upload support (3Speak)
- [ ] Audio posts
- [ ] NFT minting integration
- [ ] Multiple images per post (galleries)
- [ ] Draft saving (localStorage/backend)
- [ ] Collaborative editing
- [ ] AI writing assistant
- [ ] Template system

### Additional Packages
- `@snapie/wallet` - Hive wallet UI components
- `@snapie/profile` - User profile components
- `@snapie/notifications` - Notification system
- `@snapie/comments` - Comment thread UI

---

## Notes & Considerations

### Why This Will Work
1. **Need exists** - Every Hive app needs these components
2. **Proven code** - Already works in production on snapie.io
3. **Right timing** - Hive ecosystem growing
4. **Clear value** - Save developers weeks of work
5. **Network effect** - More users = more beneficiaries

### Potential Challenges
1. **Maintenance burden** - Need to keep updated
2. **Support requests** - Community will ask questions
3. **Breaking changes** - Hive protocol updates
4. **Competition** - Others might fork/compete

### Solutions
1. **Good documentation** - Reduce support burden
2. **Community contributions** - Share maintenance
3. **Semantic versioning** - Manage breaking changes
4. **First-mover advantage** - Be the standard

---

## License

**MIT License** (Recommended)

Why MIT?
- Most permissive
- Encourages adoption
- Commercial use allowed
- Can still monetize through services

---

## Contact & Support

- **GitHub Issues** - Bug reports, feature requests
- **Discord** - Real-time help
- **Email** - support@snapie.io
- **Hive** - @snapie

---

## Next Steps

1. ✅ Finish snapie.io blog composer features
2. ✅ Test thoroughly in production
3. 🔜 Create SDK repository structure
4. 🔜 Extract and clean components
5. 🔜 Setup build pipeline
6. 🔜 Test in fresh project
7. 🔜 Write documentation
8. 🔜 Publish to npm
9. 🔜 Announce on Hive

---

**Last Updated:** December 2, 2025
**Status:** Planning Phase
**Next Review:** After completing remaining snapie.io features
