# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Project Overview

MyCommunity is a customizable Next.js 14 frontend for Hive blockchain communities. It's a decentralized social media platform similar to Twitter/X, featuring "snaps" (short posts), blog posts, wallet integration, and multiple theme support. All content is stored on the Hive blockchain, emphasizing content permanence and user ownership.

**Live Demo:** https://mycommunity-omega.vercel.app/

## Core Commands

### Development
```bash
pnpm dev           # Start development server on localhost:3310
pnpm start         # Start production server on localhost:3310 (after pnpm build)
pnpm build         # Build for production
pnpm lint          # Run ESLint
```

**CRITICAL:** This project uses **pnpm** exclusively. Never use npm or yarn commands.

### Environment Setup
```bash
cp .env.local.example .env.local  # Create local environment file
# Edit .env.local with your community settings
```

## Architecture

### Technology Stack
- **Framework:** Next.js 14 with App Router (not Pages Router)
- **UI:** Chakra UI + Tailwind CSS
- **Blockchain:** Hive blockchain via @hiveio/dhive
- **Authentication:** Aioha (supports Keychain, HiveAuth, Ledger, PeakVault)
- **Language:** TypeScript (strict mode enabled)
- **Package Manager:** pnpm only

### Directory Structure

```
app/                    # Next.js 14 App Router
├── layout.tsx         # Root layout with providers
├── page.tsx           # Home page (snaps feed)
├── blog/              # Blog post pages
├── compose/           # Post composer
└── [...slug]/         # Dynamic user profile routes

components/
├── homepage/          # Feed components (Snap, SnapComposer, SnapList)
├── blog/              # Long-form blog post components
├── layout/            # Header, Sidebar, FooterNavigation
├── profile/           # User profile pages
├── wallet/            # Wallet and transaction components
├── notifications/     # Notification system
└── shared/            # Reusable components

lib/
├── hive/
│   ├── client-functions.ts    # Blockchain operations (vote, post, follow)
│   ├── server-functions.ts    # Server-side Hive operations
│   └── hiveclient.tsx         # Hive client initialization
└── utils/             # Helper functions

hooks/
├── useSnaps.ts        # Snaps feed logic with infinite scroll
├── usePosts.ts        # Blog posts fetching
├── useComments.ts     # Comments/replies management
├── useHiveAccount.ts  # User account data
└── useCurrencyDisplay.ts  # Currency conversion

themes/                # 8 pre-built Chakra UI themes
├── hivebr.ts
├── nounish.ts
├── cannabis.ts
├── mengao.ts
├── bluesky.ts
├── hacker.ts
├── forest.ts
└── windows95.ts

contexts/
└── UserContext.tsx    # Global user state management
```

### Key Architectural Patterns

#### 1. Theme System
- Themes are selected via `NEXT_PUBLIC_THEME` environment variable
- All themes registered in `app/providers.tsx` in the `themeMap`
- Use semantic color tokens: `primary`, `secondary`, `accent`, `background`, `text`, `muted`, `border`
- **Never hardcode colors** - always use theme tokens
- Available themes: `hivebr`, `nounish`, `cannabis`, `mengao`, `bluesky`, `hacker`, `forest`, `windows95`

#### 2. Blockchain Integration
- **Authentication:** Use `useAioha()` hook from `@aioha/react-ui`
- **Content Operations:** Import from `lib/hive/client-functions.ts`
  - `vote()` - Upvote/downvote posts
  - `commentWithKeychain()` - Create posts/comments
  - `transferWithKeychain()` - Send tokens
  - `checkFollow()`, `updateProfile()`, `communitySubscribeKeyChain()`
- All blockchain operations are asynchronous and must include error handling
- Posts on Hive are called "comments" (parent_permlink determines hierarchy)

#### 3. Content Model
- **Snaps:** Short posts (like tweets) fetched via `useSnaps.ts` hook
- **Blog Posts:** Long-form content fetched via `usePosts.ts` hook
- **Permlinks:** Generated using `new Date().toISOString().replace(/[^a-zA-Z0-9]/g, "").toLowerCase()`
- **Metadata:** All posts include `{ app: 'mycommunity', tags: [], images: [] }`
- **Hashtags:** Extracted from content and included in post metadata

#### 4. State Management
- **Global State:** `UserContext` for authenticated user data
- **Local State:** React hooks for component state
- **Custom Hooks:** Encapsulate complex logic (feed fetching, account data)
- **No Redux or Zustand** - Context API is sufficient

#### 5. Responsive Design
- Mobile-first approach with Chakra's responsive props
- Breakpoints: `base` (mobile), `md` (tablet), `lg` (desktop)
- Collapsible sidebar on mobile using `FooterNavigation`
- Full sidebar on desktop with 20% width

## Environment Variables

Required variables in `.env.local`:

```bash
# Core
NEXT_PUBLIC_THEME=hacker                          # Theme name
NEXT_PUBLIC_HIVE_COMMUNITY_TAG=hive-123456        # Your community tag
NEXT_PUBLIC_HIVE_SEARCH_TAG=hive-123456           # Search filter tag
NEXT_PUBLIC_HIVE_USER=yourusername                # Hive username
HIVE_POSTING_KEY=5J...                            # Posting key (server-side only, image signing)
NEXT_PUBLIC_DISPLAY_CURRENCY=                     # Optional: BRL, EUR, GBP, etc.

# Media / uploads
NEXT_PUBLIC_3SPEAK_API_KEY=...                    # Video + audio upload to 3speak
NEXT_PUBLIC_IMAGE_SERVER_API_KEY=...              # images.3speak.tv fallback

# Hangouts
NEXT_PUBLIC_HANGOUTS_API_URL=https://hangout-api.3speak.tv
NEXT_PUBLIC_LIVEKIT_URL=wss://livekit.3speak.tv

# Auth
NEXT_PUBLIC_HIVESIGNER_ENABLED=false              # Flip to `true` once app id + callback are set
```

**Security:** Never expose `HIVE_POSTING_KEY` to client-side code. It's only used in server functions for image signing.

## Important Development Patterns

### Adding a New Component
1. Create TypeScript functional component
2. Use Chakra UI components for UI elements
3. Use theme-aware semantic colors (e.g., `bg="background"` not `bg="#000"`)
4. Include loading states for async operations
5. Add proper TypeScript types (check `/types/` for existing types)
6. Follow responsive design patterns with Chakra breakpoints

### Blockchain Operations
```typescript
import { useAioha } from '@aioha/react-ui';
import { vote } from '@/lib/hive/client-functions';

function MyComponent() {
  // Aioha exposes the logged-in username directly on `user` (string | undefined).
  const { user } = useAioha();

  const handleVote = async (author: string, permlink: string) => {
    try {
      if (!user) throw new Error('Not logged in');

      const result = await vote({
        username: user,
        author,
        permlink,
        weight: 10000 // 100% upvote
      });

      if (result.success) {
        // Handle success
      }
    } catch (error) {
      console.error('Vote failed:', error);
      // Show user-friendly error message
    }
  };
}
```

Every broadcast in `lib/hive/client-functions.ts` runs through a single
`withTxApproval` wrapper (in `lib/hive/aioha.ts`) that triggers the shared
`HiveAuthContext` overlay. Users always see "Approve X in &lt;provider name&gt;…"
whether they're on Keychain, HiveAuth, PeakVault, or Ledger. To open the login
flow from any component, call `openLoginModal()` from `useLoginModal()`.

### Creating Posts
- Use `commentWithKeychain()` for new posts
- Include required metadata: tags, images, app identifier
- Extract hashtags from content for discoverability
- Generate unique permlink based on timestamp
- Posts without `parent_permlink` are root posts; with it are replies

### Working with Themes
To add a new theme:
1. Create `themes/newtheme.ts` following existing theme structure
2. Import in `app/providers.tsx`
3. Add to `themeMap` object
4. Update `.env.local.example` with new theme name

### Custom Hooks Usage
- `useSnaps()` - Returns snaps array, loading state, tab filter, infinite scroll
- `usePosts()` - Returns blog posts with pagination
- `useComments()` - Fetch and manage post replies
- `useHiveAccount(username)` - Get account data, followers, following
- `useCurrencyDisplay()` - Convert HBD to display currency

## Testing and Quality

- No test framework is currently configured
- Manual testing workflow:
  1. Test blockchain operations in dev mode
  2. Verify theme switching works
  3. Check responsive design on mobile/desktop
  4. Test authentication with Keychain browser extension
  5. Verify content loads from Hive blockchain

## Common Workflows

### Changing Community Configuration
1. Update `NEXT_PUBLIC_HIVE_COMMUNITY_TAG` in `.env.local`
2. Update `NEXT_PUBLIC_HIVE_SEARCH_TAG` to match
3. Restart dev server
4. Community avatar auto-fetched from Hive

### Deploying to Vercel
1. Push to GitHub
2. Connect repository to Vercel
3. Add environment variables in Vercel dashboard
4. Deploy (builds automatically)

### Debugging Blockchain Issues
1. Check browser console for Hive client errors
2. Verify user is authenticated: `console.log(useAioha().user)`
3. Check Hive node status (uses default dhive nodes)
4. Verify environment variables are set correctly
5. Test with at least one aioha provider (Keychain extension, PeakVault, HiveAuth app, or Ledger)

## Code Style Conventions

- Use TypeScript for all new files
- Follow existing component organization patterns
- Chakra UI components over raw HTML
- Async/await over promises
- Error boundaries for blockchain operations
- Comments for complex blockchain logic only
- Descriptive variable names (no single letters except loop counters)

## Important Notes

- **Content is permanent** - posts on Hive blockchain cannot be deleted, only edited within 7 days
- **User owns keys** - never store private keys; authentication via Keychain/Aioha only
- **Decentralized** - content fetched from Hive nodes, not a central database
- **Community-driven** - designed for Hive community customization and forking
- **Image uploads** - handled via Hive image hosting (images.hive.blog)
- **GIF support** - Giphy integration for GIF selection in posts
