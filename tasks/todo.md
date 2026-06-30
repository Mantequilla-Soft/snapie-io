# Plan — Peer-Sponsored Account Creation (à la hive.io /join)

## Goal
Let a prospective Snapie user generate Hive keys client-side, download/back them up, and produce a shareable link. Anyone with claimed account tokens (or willing to pay 3 HIVE) can open that link, sign in with their existing wallet, and broadcast the account-creation transaction. The new user lands on Snapie with a working account.

## Reference (hive.io)
- `apps/web/src/components/join/CreateHiveAccount.tsx` — requester form, key gen, backup, share-link
- `apps/web/src/components/join/JoinFlow.tsx` — sponsor flow, decodes `?code=`, broadcasts via existing auth
- `lib/share-link.ts` (in their hive-lib) — `generateShareableLink` / `decodeAccountData`
- They use `@hiveio/hive-lib` (their wrapper); we'll re-implement equivalents on top of `@hiveio/dhive` + Aioha, both already in this repo.

## What snapie-io already has
- `@hiveio/dhive` 1.3.1-beta — `PrivateKey.fromLogin(account, password, role)` for deterministic key derivation.
- Aioha (`@aioha/aioha`, `@aioha/react-provider`) — `getAioha()` singleton in `lib/hive/aioha.ts` already registers Keychain, HiveAuth, PeakVault, Ledger. `aioha.signAndBroadcastTx(ops, KeyTypes.Active)` will work for sponsors.
- `lib/hive/server-functions.ts:43` — server-side `createAccount` using `ACCOUNT_CREATOR` env (Snapie-paid path; reusable as a third option, not the primary one).
- Login is already wired through `LoginModalContext` + Aioha modal.

## Decisions (locked)

- [x] **Sponsor signing transport** — Aioha (already wired). Keychain/HiveAuth/PeakVault/Ledger all work without new code.
- [x] **Paid vs claimed** — default `create_claimed_account_operation`. If sponsor has no ACTs, surface two explicit options: claim one first (`claim_account_operation`, RC cost) or pay 3 HIVE (`account_create_operation`). No silent fallback.
- [x] **Snapie-sponsored option** — deferred to **Phase 7** (post-launch). v1 ships peer-sponsor only.
- [x] **Route** — single `/join` page, mode-switches on `?code=` param (matches hive.io).
- [x] **QR rendering** — add `qrcode.react` dep.
- [x] **Styling** — Chakra UI to match the rest of the app.

## Threat model & non-negotiables
- **Master password and private keys must never leave the browser.** All key derivation client-side. Password is only used to derive keys, then discarded after the user downloads the backup.
- **The shareable link contains ONLY public keys + the requested username.** Confirm with an encode→decode round-trip before showing the link (hive.io does this in `CreateHiveAccount.tsx:336`).
- **Username availability is advisory, not authoritative.** Final check happens at broadcast time on the sponsor side; show a clear error if the name was claimed in the gap.
- **Sponsor confirms they understand they're paying RC / ACT / 3 HIVE** before signing. No silent broadcasts.

---

## Phase 1 — Client-side key generation library

- [ ] Create `lib/hive/account-create-client.ts` (client-only, no `'use server'`):
  - [ ] `generatePassword()` — `Uint32Array(10)` + `crypto.getRandomValues` + `PrivateKey.fromSeed(...).toString().slice(0, 25)` (mirror `server-functions.ts:25` but client-side).
  - [ ] `generateKeys(username, password)` → `{ owner, ownerPubkey, active, activePubkey, posting, postingPubkey, memo, memoPubkey }`.
  - [ ] `validateAccountName(name)` → `{ isValid, error? }`. Rules: 3–16 chars, lowercase, segments separated by `-` or `.`, each segment starts with a letter, no consecutive separators, no trailing separator. Match Hive's `is_valid_account_name`.
  - [ ] `checkAccountAvailability(name)` — `dhive.database.getAccounts([name])`; return `accounts.length === 0`.
  - [ ] `downloadBackupFile(account, password, keys)` — generate plain-text or PDF blob with username, master password, all four private keys (WIF) and public keys, recovery instructions; trigger download. Detect iOS in-app browser → fall back to clipboard copy.

- [ ] Create `lib/hive/share-link.ts`:
  - [ ] `type ShareableAccountData = { username, ownerPubkey, activePubkey, postingPubkey, memoPubkey }`
  - [ ] `encodeAccountData(data)` → base64url(JSON.stringify(data)) using a compact key map (`{u, o, a, p, m}`) to keep URLs <300 chars.
  - [ ] `decodeAccountData(encoded)` → `ShareableAccountData | null` (returns null on malformed input — never throw).
  - [ ] `generateShareableLink(data)` → `${window.location.origin}/join?code=${encoded}`.

## Phase 2 — Requester form (`components/join/CreateAccountForm.tsx`)

- [ ] Username input with 500ms-debounced availability check (mirrors hive.io `handleAccountChange`).
- [ ] Auto-generate a master password on mount; allow regenerate / show / hide / edit / copy.
- [ ] Live-derive keys whenever (username, password) both valid.
- [ ] "View keys" modal showing all four key pairs (private + public, copy buttons).
- [ ] "Download backup" button → `downloadBackupFile`. Backup-confirmation checkbox is required to proceed.
- [ ] Primary action: **"Generate share link"** → encodes share data, opens dialog with copy field + QR (`qrcode.react` not yet in deps, see Phase 5) + Discord/Telegram quick-share buttons.
- [ ] Poll `database.getAccounts([username])` every 5s while share dialog is open; flip to success state when account exists. Show "View on Hive" link to `https://hiveblocks.com/@username`.
- [ ] Skip the "logged-in user creates with their own ACTs" path for v1 — that's a separate flow and isn't what was asked.

## Phase 3 — Sponsor flow (`components/join/SponsorFlow.tsx`)

- [ ] Decode `?code=` from `useSearchParams()`. Show error card if invalid/missing.
- [ ] Display: requested username, expandable accordion of the four public keys, plain-language explanation ("Someone is asking you to sponsor their Snapie account by spending one Account Creation Token, or 3 HIVE").
- [ ] If not authenticated → CTA opens existing `LoginModalContext` (which uses Aioha).
- [ ] On authenticated:
  - [ ] Look up sponsor's `pending_claimed_accounts` via `database.getAccounts([sponsor])`.
  - [ ] If `>0` → primary button "Sponsor with 1 ACT (free)" broadcasts `create_claimed_account` (op shape from `server-functions.ts:48-72`, but with sponsor as `creator`).
  - [ ] If `=0` → show two options: (a) "Claim an ACT first" (broadcasts `claim_account` with `fee: 0 HIVE`, requires RC), then retry; (b) "Pay 3 HIVE instead" (broadcasts `account_create` with full new-account fields and `fee: '3.000 HIVE'`).
  - [ ] All broadcasts via `aioha.signAndBroadcastTx([op], KeyTypes.Active)`.
- [ ] On success: show tx id + `https://hiveblocks.com/tx/{id}` link, plus a "Tell @username they can log in now" CTA.

## Phase 4 — Routing

- [ ] `app/join/page.tsx` — `'use client'` page that reads `?code=` and renders either `<CreateAccountForm />` or `<SponsorFlow encodedData={code} />`. Wrap in `<Suspense>` for `useSearchParams`.
- [ ] Add a "Create account" link in `components/auth/LoginModal.tsx` and on the marketing/landing area pointing to `/join`.
- [ ] No other route changes (the `[...slug]` catch-all handles Hive @username slugs and shouldn't conflict with `/join`).

## Phase 5 — Dependencies & infra

- [ ] Add `qrcode.react` (BSD-licensed, ~12 KB) for the share dialog QR. If we want zero new deps, generate via the public `https://api.qrserver.com` endpoint instead — slower and a privacy trade since the link transits a third party. Recommend the lib.
- [ ] No new build/runtime infra required. No env vars (the existing `ACCOUNT_CREATOR`/`ACCOUNT_KEY` server vars are unrelated to the peer-sponsor flow).

## Phase 6 — Verify

- [ ] Manual: generate a link in dev, decode round-trip, confirm public keys match. Verify backup file contains all keys + password.
- [ ] Username validation: try `ab` (too short), `Foo` (uppercase), `foo--bar` (consecutive sep), `1foo` (digit-leading segment), `foo.` (trailing sep) — each must be rejected with a specific message.
- [ ] On mainnet (or testnet if available) with a sponsor account holding ≥1 ACT: complete the full flow end-to-end. Confirm new account is created and the requester's polling auto-flips to success.
- [ ] Sponsor with 0 ACTs and 0 RC for `claim_account`: confirm the 3-HIVE fallback path works (or is gated cleanly).
- [ ] Mobile / iOS in-app browser: backup-file fallback (clipboard copy) works; QR scans correctly.
- [ ] Invalid `?code=`: page shows the error card, doesn't crash.

## Phase 7 — Snapie-sponsored option (post-launch)

Adds a "Get sponsored by Snapie" button to the requester form for users with no friend on Hive. Same trust model as Ecency/InLeo's free-signup.

- [ ] `POST /api/join/sponsor` — accepts `{ username, ownerPubkey, activePubkey, postingPubkey, memoPubkey, turnstileToken }`. **Never accepts a password or private key.** Validates name format + availability + captcha, then broadcasts `create_claimed_account` server-side using `ACCOUNT_CREATOR` / `ACCOUNT_KEY` env.
- [ ] Cloudflare Turnstile (or hCaptcha) integration.
- [ ] Rate-limit: 1 signup per IP per hour, sliding window.
- [ ] Daily cap on `ACCOUNT_CREATOR` outflow (env-configurable) so a leak can't drain the ACT pool overnight.
- [ ] Monitoring: log `pending_claimed_accounts` on `ACCOUNT_CREATOR`; alert when low so ACTs can be refilled.
- [ ] Deprecate / lock down the existing `createAccount(username, password)` in `lib/hive/server-functions.ts:43` — current signature accepts the master password server-side, which is unsafe. Replace usages with the new pubkey-only path.

## Out of scope for v1
- i18n (hive.io has heavy `next-intl` use; we ship English first).
- Keychain "Add account" deep-link after success (`window.hive_keychain.requestAddAccount`) — nice-to-have.
- Email-based account recovery / Snapie-managed keys.
- Captcha / rate-limit on the availability-check endpoint (low risk, pure read).

## Files to create
1. `lib/hive/account-create-client.ts`
2. `lib/hive/share-link.ts`
3. `components/join/CreateAccountForm.tsx`
4. `components/join/SponsorFlow.tsx`
5. `components/join/KeysModal.tsx`
6. `components/join/ShareLinkDialog.tsx`
7. `app/join/page.tsx`

## Files to touch
- `package.json` — add `qrcode.react`.
- `components/auth/LoginModal.tsx` — link to `/join` for new users.
- (Optional) homepage / header — surface "Create an account" entry point.

## Effort estimate
- Phase 1 (libs): ~3–4 hrs
- Phase 2 (requester UI): ~5–6 hrs
- Phase 3 (sponsor UI): ~3–4 hrs
- Phase 4 (route + entry points): ~1 hr
- Phase 6 (verify on chain): ~2 hrs (needs a sponsor account with ACT)

Total: ~1.5–2 focused dev days for a working v1.

---

# Review — Fix "send short via chat" (2026-06-29)

## Problem
Two bugs in the `604fe80` shorts-via-chat feature:
1. Preview card thumbnail/title often blank — `/api/short-meta` read `json_metadata.image[0]` / `title` from the Hive post, which is empty for many 3speak shorts (e.g. snapie-mobile snaps).
2. Clicking the card opened `/shorts` but played the random feed — `ShortsPlayer` never read the `?v=` param.

## Root cause (confirmed with live API calls)
- The reliable thumbnail/title source is `https://play.3speak.tv/api/watch?v=author/<videoPermlink>`, keyed by the **3speak video permlink**, not the Hive post permlink.
- The two permlinks differ for snaps (`snap-…` vs `3cb3gaih`). The video permlink is recoverable from the Hive post's `json_metadata.video.url`.

## Changes
- NEW `lib/shorts/shortMeta.ts` — pure helpers: `extractVideoPermlink`, `isFilenameTitle`, `firstBodyLine`, `pickTitle`, `pickThumbnail`.
- MOD `app/api/short-meta/route.ts` — resolve video permlink from `video.url`, fetch the 3speak watch API for thumbnail/title, return `{ author, hivePermlink, videoPermlink, thumbnailUrl, title, stats }`.
- MOD `hooks/useShorts.ts` — added `prime(target)` + `seenKeysRef` dedupe so a shared short plays first and isn't duplicated by the feed.
- MOD `components/shorts/ShortsPlayer.tsx` — reads `?v=`, resolves the target via `/api/short-meta`, primes it, loads the feed in background.
- NEW Vitest setup (`vitest.config.ts`, `test` scripts) + `lib/shorts/shortMeta.test.ts` (14 tests, all pass).

## Verification
- `pnpm test` → 14/14 pass.
- Live route check: previously-blank `wendyth16/snap-1782692085491` now returns real thumbnail + title "Golden sunset." + videoPermlink `3cb3gaih`; legacy `meno/127fd37d` resolves via fallback. `tsc --noEmit` clean for changed files.
- Browser playback not exercised (no Chrome in env); player path is a direct consequence of the verified resolution (autoLoads `author/videoPermlink`).
