# Testdrive

This branch is a local combination of fork performance and fix work. It is for running on your machine. It does not target upstream.

You need Docker. Nothing else is installed on the host.

```bash
git clone -b testdrive/combined https://github.com/hiveuprss/snapie-io && cd snapie-io
docker compose -f docker-compose.testdrive.yml up --build
```

Open http://localhost:3000

The published port is bound to `127.0.0.1` only. Copy `.env.testdrive.example` to `.env.testdrive` if you want to override server-side variables. If `.env.testdrive` is missing, Compose uses the example file. `NEXT_PUBLIC_*` values are taken from the example file when the image is built. Editing them only in `.env.testdrive` does not change the browser bundle until you rebuild from an edited example. The example search tag is `hive-178315`, the live Snapie community. Home Long Reads and the blog search use it.

## Included changes

Started from upstream `main` (`cfcde147`). Includes the home LCP work.

- Hive RPC proxy failover: one node at a time, instead of calling every node at once (fork #6, upstream #160)
- `robots.txt`, and the closed login modal no longer emits links without `href` (#8)
- Contrast, landmarks, and accessible names (#9)
- Logged-out visitors no longer fire requests that are expected to fail (#10)
- Profile cover images load through `/api/image-proxy` (#11)
- The first page of the public feed is server-rendered (#7)
- Per-snap Hive content lookups are batched (#13, stacked on #7)
- Chat, wallet providers, and games are lazy-loaded (#14)
- Profile headers are server-rendered on their own routes (#15, stacked on #14)
- Dead image hosts fall back through the Hive image cache, and feed images go through `/api/image-proxy` (#16, #17)
- The first feed image is a priority image with no fade-in. Later images still fade in. A failed image stays a neutral tile (#18). The experimental script hold is off (`SNAPIE_DEFER_FRAMEWORK_SCRIPTS=0`). Set it to 1 to enable the experimental script hold.

## Merge conflicts

Two conflicts. Both sides were kept.

`app/api/hive-rpc/route.ts`, while merging `cursor/batch-hive-content-lookups-541e`:

The batch branch still carried the older handler that races every node and added the batch contract: a JSON-RPC array body is forwarded unchanged, and a response array that mixes results with per-item errors is a success payload, not a 503. The failover branch replaced that race with one node at a time. The resolution calls `dispatchHiveRpc` (one unhealthy node, then the next) and keeps the batch contract. The parallel race was not put back. The browser client still coalesces small reads into one batch POST. Its comment matches the failover proxy.

`components/profile/ProfilePage.tsx`, while merging `cursor/ssr-profile-header`:

The cover-image branch imports `ProfileCover`. The profile-header branch imports `ProfileSeedAccount` for the server-rendered header. Both imports stay. The cover still goes through the image proxy, and `initialAccount` still types the server-rendered header. The earlier contrast change (`opacity={1}` on the header scrim) is still there.

`components/shared/ImageWithFallback.tsx`, while merging `cursor/home-mobile-lcp-eb26`:

The image-proxy branch renders a neutral tile when a feed image fails (`data-image-fallback`, no link, no "Image failed to load" text). The LCP branch paints the first card's image immediately (`priority`, no opacity fade, no skeleton) and still fades later images. Both stay: a priority image is visible in the server HTML, and `onError` still swaps in the neutral tile.

## What works logged out

With the example env and no extra services:

- Home feed, a post, a profile, the wallet view, explore, blog, and settings render
- `/api/hive-rpc` reaches public Hive nodes
- `/api/image-proxy` and the image optimizer serve public images
- `/robots.txt` is served
- `GET /api/snapie-auth/auth/me` with no session cookie returns `{ authenticated: false }`
- Hangouts shows that they are not configured
- Points, the item market, roulette, and games stay off, so they do not need MongoDB

## Hive Keychain

Keychain sign-in does not use the Snapie auth server. The login modal loads Aioha in the browser, the extension signs there, and the app stores the Hive account locally. Voting and posting then broadcast through Keychain the same way.

There is no session server in this setup, and one is not faked. Custodial Snapie login, email session restore, and anything that posts to `/api/snapie-auth/*` other than the logged-out `auth/me` probe answer `503` with `snapie_auth_not_configured` while `SNAPIE_AUTH_URL` is blank.

## Known limitations

- Chat has no MongoDB. The dummy `CHAT_JWT_SECRET` only lets the server import chat routes. Messages are not stored. Push notifications and ButrAuth are unset.
- Points, market, roulette, and games are off.
- Hangouts and LiveKit are off.
- Image and video upload need API keys and a posting key, which are blank. Viewing images does not.
- Account creation and the faucet need creator keys, which are blank.
- Translation is off.
- The activity sidecar is not running. Those routes return an empty payload.
- The image is built with Bun 1.4.2. The runtime stage is `oven/bun:1.4.2-distroless` and runs the standalone `server.js` under Bun as uid 65532 (`nonroot`), on port 3000. It copies `.next/standalone`, `.next/static`, and `public`. `libstdc++` and `libgcc` are taken from the build image for that CPU (`x86_64-linux-gnu` or `aarch64-linux-gnu`). The glibc sharp/libvips build for that CPU is kept; musl and the other architecture are omitted. There is no install cache and no `chown -R` layer. The runtime image is about 191 MB on amd64 and about 201 MB on arm64. `bun.lock` was migrated from `pnpm-lock.yaml` and resolves the same package versions. The experimental script hold stays off unless `SNAPIE_DEFER_FRAMEWORK_SCRIPTS=1`.
- Bun's server `navigator` object exists, but `navigator.language` is missing. The first image build prerendered `/` and threw on `navigator.language.split`. Language detection now treats a missing language as `en`, the same fallback as a missing `navigator`. After that, install, build, and the runtime all stay on Bun. Image proxy (`node:http` / `node:https`), the sharp optimizer, route handlers, and middleware did not need a Node runtime.

## Checks on this branch

`bun run test`, `tsc --noEmit`, and `bun run build` pass. Two test files needed type-only fixes so `tsc` matched the merged tests (`ProfileCover.test.tsx`, `rpcBatch.test.ts`).
