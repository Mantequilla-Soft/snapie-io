# Snapie.io

Snapie.io is a Next.js app for Hive-native social experiences: short-form Snaps, blog feeds, community discovery, OpenPods hangouts, and a real-time chat system with channels, DMs, and groups.

## What This App Includes

- Hive-first feed experience (Snaps + Blog)
- Community and following-based filtering
- Wallet/auth flows through Aioha providers
- OpenPods/Hangouts integration (LiveKit-backed)
- Real-time chat with:
  - Public channels
  - Direct messages (DMs)
  - Custom group chats (public/private)
  - Mute/block controls
  - Push notifications (FCM, optional)
  - Encrypted Hive memo fallback for DM delivery nudges

## Tech Stack

- Next.js 14 (App Router)
- React 18 + TypeScript
- Chakra UI
- MongoDB + Mongoose (chat state)
- Hive APIs via `@hiveio/dhive`
- Aioha wallet/auth providers
- Firebase Cloud Messaging (optional, chat push)

## Quick Start

### Requirements

- Node.js 18+
- npm or pnpm
- MongoDB instance (for chat)

### Install

```bash
npm install
```

### Configure env

Copy and edit:

```bash
cp .env.local.example .env.local
```

At minimum, set your community and chat auth/database values (see full env section below).

### Run

```bash
npm run dev
```

App runs on `http://localhost:3310`.

## Scripts

- `npm run dev` - start local dev server on port `3310`
- `npm run build` - production build
- `npm run start` - run production server on port `3310`
- `npm run lint` - run Next.js ESLint
- `npm run chat:backfill` - backfill legacy chat docs with current schema fields

## Environment Variables

Use `.env.local` for local development.

### Core App / Community

- `NEXT_PUBLIC_THEME` - UI theme name
  - available: `bluesky`, `hacker`, `forest`, `cannabis`, `mengao`, `nounish`, `hivebr`, `windows95`
- `NEXT_PUBLIC_HIVE_COMMUNITY_TAG` - default community tag (e.g. `hive-167980`)
- `NEXT_PUBLIC_HIVE_SEARCH_TAG` - search/feed tag (often same as community tag)
- `NEXT_PUBLIC_HIVE_USER` - default/seed Hive username (without `@`)
- `NEXT_PUBLIC_DISPLAY_CURRENCY` - optional payout display currency

### Media Upload / External APIs

- `HIVE_POSTING_KEY` - posting key for image upload signing (server side only)
- `NEXT_PUBLIC_3SPEAK_API_KEY` - 3Speak upload access
- `NEXT_PUBLIC_IMAGE_SERVER_API_KEY` - fallback image server key

### Hangouts / OpenPods

- `NEXT_PUBLIC_HANGOUTS_API_URL` - hangouts API base URL
- `NEXT_PUBLIC_LIVEKIT_URL` - LiveKit websocket URL
- `NEXT_PUBLIC_HANGOUTS_TOKEN_STORAGE` - `none`, `session`, or `local`

### Chat (Required)

- `MONGODB_URI` - MongoDB connection string
- `MONGODB_DB_NAME` - chat database name (default in code: `snapiechat`)
- `CHAT_JWT_SECRET` - signing secret for chat JWT tokens (use strong random value)
- `NEXT_PUBLIC_CHAT_DEFAULT_CHANNEL` - initial channel id/name (e.g. `general`)

### Translation (Optional)

Snapie supports per-snap inline translation via a self-hosted [LibreTranslate](https://github.com/LibreTranslate/LibreTranslate) instance. When configured, a translate button appears below each snap's text content and detects the user's browser language automatically.

- `LIBRETRANSLATE_URL` - base URL of your LibreTranslate instance (e.g. `http://localhost:5000` if on the same server)
- `LIBRETRANSLATE_KEY` - API key for the instance (required when `LT_API_KEYS=true`)

**Self-hosting LibreTranslate (Docker):**

```bash
docker run -d \
  --name libretranslate \
  -p 127.0.0.1:5000:5000 \
  -e LT_API_KEYS=true \
  -e LT_API_KEYS_DB_PATH=/app/db/api_keys.db \
  -v lt-db:/app/db \
  --restart unless-stopped \
  libretranslate/libretranslate
```

Wait for `Listening at: http://[::]:5000` in the logs, then generate an API key:

```bash
docker exec libretranslate ltmanage keys add snapie
```

Copy the printed key into `LIBRETRANSLATE_KEY`. If these vars are not set, the translate button is silently disabled and the rest of the app is unaffected.

### Chat Push Notifications (Optional but recommended)

- `FIREBASE_SERVICE_ACCOUNT` - base64-encoded Firebase Admin service account JSON
- `NEXT_PUBLIC_FIREBASE_CONFIG` - JSON stringified Firebase web config
- `NEXT_PUBLIC_FIREBASE_VAPID_KEY` - VAPID key for browser push tokens

If these are not set, chat still works and falls back to polling behavior.

## Chat Architecture (Current)

### Client

- Chat UI: `components/chat/ChatPanel.tsx`
- Client API wrapper: `lib/chat/ChatService.ts`
- FCM browser integration: `lib/chat/fcmClient.ts`
- Service worker: `public/firebase-messaging-sw.js`

### Server

- Auth:
  - `POST /api/chat/auth/challenge`
  - `POST /api/chat/auth/verify`
- Conversations:
  - `GET /api/chat/conversations`
  - `GET /api/chat/unread`
- Channels:
  - `GET/POST /api/chat/channels`
  - `POST /api/chat/channels/[id]/join`
  - `POST /api/chat/channels/[id]/leave`
  - `GET/POST /api/chat/channels/[id]/messages`
- DMs:
  - `POST /api/chat/dm`
  - `GET/POST /api/chat/dm/[id]/messages`
  - `POST /api/chat/dm/[id]/memo-fallback`
- Groups:
  - `GET/POST /api/chat/groups`
  - `POST/DELETE /api/chat/groups/[id]/members`
- Preferences/devices:
  - `GET/POST /api/chat/preferences`
  - `POST /api/chat/register-device`

### Data Models

- `lib/db/models/ChatUser.ts`
- `lib/db/models/Channel.ts`
- `lib/db/models/Message.ts`
- `lib/db/models/Challenge.ts`

## Backfill / Migration Helper

When updating from older chat data, run:

```bash
npm run chat:backfill
```

This script normalizes missing fields in existing `channels` and `chatusers` documents.

## Project Structure

- `app/` - routes and API endpoints
- `components/` - UI, including chat and hangouts
- `contexts/` - shared React context (e.g. hangouts)
- `hooks/` - feed, hangout, and UI hooks
- `lib/` - Hive, chat, DB, and utility logic
- `scripts/` - maintenance scripts (chat backfill)
- `public/` - static assets and service worker

## Deployment Notes

- This project is deployable on Vercel or any Node-compatible host.
- Ensure all required env vars are configured in your deployment platform.
- For chat push notifications in production, both server-side and client-side Firebase env vars must be present.

## Troubleshooting

- Chat auth failing (`401`): verify `CHAT_JWT_SECRET`, challenge/verify flow, and wallet signature support.
- Chat API failing at startup: verify `MONGODB_URI` and `MONGODB_DB_NAME`.
- No push notifications: verify:
  - `NEXT_PUBLIC_FIREBASE_CONFIG`
  - `NEXT_PUBLIC_FIREBASE_VAPID_KEY`
  - `FIREBASE_SERVICE_ACCOUNT`
  - browser notification permission + service worker registration
- Backfill script says `MONGODB_URI is required`: ensure `.env.local` exists and includes chat DB values.
- Translate button shows "Translation service not configured": set `LIBRETRANSLATE_URL` in your env vars.
- Translate button shows "Translation service unreachable": check that the LibreTranslate container is running (`docker ps`) and the URL is correct.
- Translate returning wrong language: LibreTranslate auto-detects source language — ensure the model for the target language was downloaded (check `docker logs libretranslate`).

## Contributing

1. Create a branch from `main`
2. Make focused changes
3. Run `npm run lint`
4. Open a PR with a clear summary + test plan

