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

CI installs with **pnpm 9.15.9** on **Node.js 22** (`pnpm-lock.yaml`). Use that pair locally. The Docker loop below is the same toolchain without installing Node, pnpm, or Mongo on the host.

### One-command loop (Docker)

Docker Compose v2.20 or newer (current Docker Desktop). No host Node or pnpm.

`node:22-bookworm` and `mongo:7` are official multi-arch images (`linux/arm64` and `linux/amd64`). Apple Silicon pulls arm64. Do not set `platform` or `DOCKER_DEFAULT_PLATFORM`.

Feed only (Mongo is not started; `.env.local` is created from the example on first run):

```bash
docker compose up
```

App runs on `http://localhost:3310`.

Hangouts/chat, with a local Mongo stub:

```bash
docker compose --profile chat up
```

Equivalent scripts when pnpm is already on the host: `pnpm dev:docker` and `pnpm dev:docker:chat`.

### Host toolchain (same as CI)

- Node.js 22 (`.nvmrc`)
- pnpm 9.15.9 (`packageManager` in `package.json`; Corepack can activate it)

```bash
corepack enable
corepack prepare pnpm@9.15.9 --activate
pnpm install --frozen-lockfile
cp .env.local.example .env.local
pnpm dev
```

Mongo only, app still on the host (then set `MONGODB_URI=mongodb://127.0.0.1:27017/snapiechat` in `.env.local`):

```bash
docker compose --profile chat up mongo
```

### Configure env

```bash
cp .env.local.example .env.local
```

The example boots a **feed-only** dev path: community defaults are set, `CHAT_JWT_SECRET` is a non-empty local placeholder, and `MONGODB_URI` is unset. `CHAT_JWT_SECRET` must be non-empty even for `pnpm build` — `lib/chat/auth.ts` throws at import, and Next loads that module during `next build`. CI sets `CHAT_JWT_SECRET=ci-build-placeholder` for the build job. Use the **chat profile** section in `.env.local.example` when hangouts or chat need Mongo, LiveKit, or push. Do not commit `.env.local` or real secrets.

## Scripts

- `pnpm dev` - start local dev server on port `3310`
- `pnpm dev:docker` - same server via Docker Compose (Node 22 + pnpm 9)
- `pnpm dev:docker:chat` - Docker Compose with the Mongo stub (`--profile chat`)
- `pnpm build` - production build (`CHAT_JWT_SECRET` must be non-empty)
- `pnpm start` - run production server on port `3310`
- `pnpm lint` - run Next.js ESLint
- `pnpm typecheck` - write gitignored `next-env.d.ts`, then `tsc --noEmit` (same as CI)
- `pnpm test` - run Vitest
- `pnpm chat:backfill` - backfill legacy chat docs with current schema fields (needs `MONGODB_URI`)

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

### Build (required even for a feed-only checkout)

- `CHAT_JWT_SECRET` - must be **non-empty** for `pnpm dev` once chat routes are compiled and for every `pnpm build` / `next build`. `lib/chat/auth.ts` throws `CHAT_JWT_SECRET is not defined` at import time. The example file ships a local placeholder (`local-dev-not-a-secret`). CI uses `ci-build-placeholder`. Use a strong random value in any shared or deployed environment. This is not a `NEXT_PUBLIC_` variable.

### Chat profile (hangouts + chat)

Not required to boot the feed. Unset `MONGODB_URI` and chat connects only when a route calls it. See the chat profile section of `.env.local.example` and `docker compose --profile chat up`.

- `MONGODB_URI` - MongoDB connection string. Inside Compose with the chat profile the dev entrypoint defaults this to `mongodb://mongo:27017/snapiechat` when the example leaves it unset. From the host, with only Mongo in Docker: `mongodb://127.0.0.1:27017/snapiechat`.
- `MONGODB_DB_NAME` - chat database name (default in code: `snapiechat`)
- `NEXT_PUBLIC_CHAT_DEFAULT_CHANNEL` - initial channel id/name (e.g. `general`)

### Hangouts / OpenPods

Part of the chat profile in `.env.local.example`. Public endpoints; the feed does not need them, and they do not need Mongo.

- `NEXT_PUBLIC_HANGOUTS_API_URL` - hangouts API base URL
- `NEXT_PUBLIC_LIVEKIT_URL` - LiveKit websocket URL
- `NEXT_PUBLIC_HANGOUTS_TOKEN_STORAGE` - `none`, `session`, or `local`

### Chat sign-in with ButrAuth (Optional)

Lets an app that signs its users in through [ButrAuth](https://butrauth.com) put
them in chat with their ButrAuth access token instead of a Hive signature. This
is the only way **warm-up users** (a ButrAuth identity, no Hive account yet) can
chat: they appear as `~<butrauth userId>`, shown by their handle, and their
conversations move to their Hive name the first time they sign in after
graduating.

Off unless both of these are set **and** `@mantequilla-soft/butrauth-client`
(>= 0.6.0) is installed; it is loaded at runtime, so a build without it is fine.

- `BUTRAUTH_URL` - the ButrAuth deployment, e.g. `https://butrauth.com`
- `BUTRAUTH_CHAT_AUDIENCES` - comma-separated clientIds whose tokens are accepted; a token issued to any other app is refused
- `BUTRAUTH_ISSUER` - expected `iss` (default `butrauth`)

The app's **server** calls `POST /api/chat/auth/butrauth { accessToken }` (or
`client.authenticateWithButrAuth(token)` in `@snapie/chat-client`) and passes the
returned `token` + `username` to the browser's `client.useSession(...)`.

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
pnpm chat:backfill
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

- `next build` or a chat route throws `CHAT_JWT_SECRET is not defined`: set a non-empty `CHAT_JWT_SECRET`. An empty value fails the same way. The example file and CI both use placeholders; shared environments need their own secret.
- Chat auth failing (`401`): verify `CHAT_JWT_SECRET`, challenge/verify flow, and wallet signature support.
- Feed loads with `MONGODB_URI` unset. Chat requests then fail with `MONGODB_URI is not defined` until the chat profile Mongo stub is configured (`MONGODB_URI`, optional `MONGODB_DB_NAME`).
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

Branch from `staging` and open the pull request against `staging`. Keep it small. Run `pnpm lint`, `pnpm typecheck`, and `pnpm test` before opening. Feed or performance changes should include before/after Lighthouse notes when relevant. Details: [CONTRIBUTING.md](CONTRIBUTING.md).

