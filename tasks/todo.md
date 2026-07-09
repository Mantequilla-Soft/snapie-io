# Plan — For You Feed Personalization (Discovery Engine Phase 2, 2026-07-08)

Full plan: `/home/meno/.claude/plans/radiant-yawning-kernighan.md`. Turns "For You" from a raw community-tag filter into a real 3-state feed: cold (community-scoped, engagement-ranked) → warm (cross-community, snaps+waves, interest-tag ranked) → cosmetic "Snapie community" badge in both states. Same flag+allowlist dogfooding discipline as Phase 1.

- [x] Phase 1 — Cold-state engagement ranking (`snapTrending.ts` raw/ranked split, `fetchForYouSnapCandidates`, `/api/discovery/foryou-candidates`, `useTrendingFeed` `endpoint` param, wire into `app/page.tsx`)
- [x] Phase 2 — Interest-tag capture (UserSettings fields, topic vocabulary sampling script, `InterestPicker` onboarding modal)
- [x] Phase 3 — Category cache (`PostCategory` Mongo model, `postCategoryCache.ts`, Combflow client extraction)
- [ ] Phase 4 — Warm candidate pool (snaps + sidecar waves, categorization, tag-match+velocity ranking, `/api/discovery/foryou-warm`)
- [x] Phase 5 — Wiring: 3-way state in `app/page.tsx`, cosmetic `SnapieCommunityBadge` in `Snap.tsx`

### Phase 1 review (2026-07-08)
- `snapTrending.ts` split into a shared cached raw pool (`fetchRawSnapPool`) + two ranked views: `rankSnapCandidates` (Trending, tags `isDiscovery/discoveryReason`) and new `rankForYouCandidates` (no tag). `fetchForYouSnapCandidates(limit, offset)` filters the raw pool to Snapie-community-tagged posts, ranks by velocity, same `{items, hasMore}` contract as Trending.
- New route `/api/discovery/foryou-candidates`, same swallow-to-empty pattern as every other discovery route.
- `useTrendingFeed` gained an optional `endpoint` param (default unchanged) so both pools share one hook.
- `app/page.tsx`: `isForYouRanked = showTrendingTab && activeFilter === 'community'` branches "For You" to the new ranked hook for allowlisted accounts only; `useSnaps` skip extended; discovery-badge interleave narrowed to `activeFilter === 'all'` only (redundant on an already-ranked "For You").
- Verified: 32/32 unit tests pass (new `rankForYouCandidates` suite), `tsc --noEmit` clean, `curl` confirms community-tag-only + velocity ordering, live browser check as `@snapieapp` confirms For You shows ranked community content with no Trending badge while Trending tab is unaffected (separate endpoint, separate pool), `pnpm build` clean.

### Phase 2 review (2026-07-08)
- Sampled 40 diverse recent Hive posts (mixed created/trending sort, all communities) through the existing Combflow proxy — 39 classified, 18 distinct raw category slugs observed. Saved the sampler as `scripts/sample_combflow_categories.mjs` for re-runs.
- `lib/discovery/interestTopics.ts` — `INTEREST_TOPICS`, 14 display options mapping to those observed slugs (a couple of thin/adjacent ones merged, e.g. philosophy+spirituality). User confirmed the list before building.
- `hooks/useUserSettings.ts` — added `interestTags: string[]` (default `[]`) and `interestsOnboardedAt: number | null` (default `null`); non-breaking via the existing `{...defaults, ...parsed}` merge.
- `components/onboarding/InterestPicker.tsx` — new Chakra modal, chip multi-select, Skip (stamps `interestsOnboardedAt` with empty `interestTags`) vs Save (stores selected tags), both calls close the modal automatically via the settings-store re-render (no explicit onClose plumbing needed).
- `app/LayoutContent.tsx` — mounts it dynamically, gated by `isDiscoveryEnabledFor(user) && settings.interestsOnboardedAt === null` — same allowlist gate already proven for the Trending tab.
- Verified: `tsc --noEmit` and `pnpm test` (32/32) clean; live browser check as `@snapieapp` — modal renders all 14 topics, Save round-trips `interestTags`/`interestsOnboardedAt` to localStorage correctly, Skip stamps an empty array, modal reappears when `interestsOnboardedAt` is cleared and disappears immediately after Save/Skip with no manual close; non-allowlisted gating verified by code (same `isDiscoveryEnabledFor` already proven, not re-tested via logout to avoid disrupting the dogfood session). `pnpm build` clean.
- Note: `pnpm build` overwrites the dev server's `.next` build artifacts and breaks it until restarted — hit this after Phase 1's build too; now restarting the dev server immediately after every `pnpm build` during this loop.

### Phase 3 review (2026-07-08)
- `lib/db/models/PostCategory.ts` — new Mongoose model (`_id` = `author/permlink`, `categories: string[]` indexed, sentiment/language/nsfw fields, `cachedAt`). No Mongo TTL index on purpose — freshness (30-day) is checked at read time so a stale doc remains available as a fallback rather than being deleted.
- `lib/combflow/client.ts` — extracted `fetchCombflowPost` (+ `CombflowHttpError` carrying the original status) out of the existing proxy route; the route now calls this shared client, behavior-preserving (same 404 vs 502 distinction as before, verified by reading the diff).
- `lib/discovery/postCategoryCache.ts` — `getOrFetchPostCategory` (Mongo hit → no Combflow call; miss/stale → fetch+upsert; Combflow failure → falls back to stale doc, else null) and `getOrFetchPostCategories` (bounded-concurrency batch wrapper, cap 5).
- Verified against real dev Mongo via a temporary debug route (deleted after use): first pass hit Combflow (691–1786ms/call), second pass was cache-only (~100ms/call) with identical results — confirmed no re-hit. Stale-fallback path verified separately (seeded a stale doc for a nonexistent author/permlink guaranteed to 404 on Combflow, confirmed the stale doc came back instead of null).
- `tsc --noEmit`, `pnpm test` (32/32), and `pnpm build` all clean after removing the debug routes and clearing stale `.next/types` references to them.

### Phase 4 — complete, verified (2026-07-08)
- **Finding (confirmed, not just a hypothesis)**: Combflow only classifies top-level Hive posts, not comments — snaps/waves are both technically comments (`parent_author: peak.snaps`/`ecency.waves`). 19/19 sampled snaps returned `{"error":"Not found."}` from Combflow vs. 39/40 hit rate on genuine top-level posts (Phase 2's sample). This makes the original Combflow-based category-matching design structurally unable to work for snap/wave content, independent of code correctness.
- **User-approved fix**: v1 hashtag/keyword matching instead of Combflow, for snaps/waves specifically. New `lib/discovery/tagKeywordMatch.ts` — `matchTagsToCategories(json_metadata)`, a hand-curated keyword→category-slug dictionary (e.g. `garden`/`farming` → `homesteading`, `btc`/`bitcoin` → `crypto`) matched case-insensitively against each item's own `json_metadata.tags`. No AI, no new external dependency, no per-item cost — reuses metadata already fetched. Documented, accepted limitation: only catches snaps/waves that already self-tagged with something recognizable; won't catch everything.
- `lib/discovery/forYouWarm.ts` rewritten to drop the (now-known-futile) Combflow calls entirely for this pool — `filterAndRankByCategory` is now pure hashtag-matching + velocity ranking, no I/O, fully unit-testable. `buildWarmPool` sources snaps (`getRawSnapPool`, shared cache with Phase 1) + waves (`sidecarClient.ts`, extracted from `app/api/feed/route.ts` behavior-preservingly), applies community mutes in the cached pool, personal mutes per-request (avoids leaking one user's mutes into another's cached results).
- Also fixed `lib/db/mongodb.ts` to throw lazily inside `connectDB()` instead of at module-import time — a real fragility unrelated to the hashtag pivot (any transitive importer crashed before, even one that never touched Mongo); found because `forYouWarm.test.ts` imports pulled in the Mongo module transitively.
- Phase 3's `postCategoryCache.ts`/`getOrFetchPostCategories` is intentionally NOT deleted — it's real, tested, standalone infra (Combflow works great for genuine top-level posts) that stays on the shelf for a possible future "broaden warm pool to include real posts" phase; just not wired into Phase 4 anymore since Phase 4 only sources snap/wave content.
- Verified: `lib/discovery/tagKeywordMatch.test.ts` (9 tests) + `lib/discovery/forYouWarm.test.ts` (8 tests, rewritten for the new signature) — 49/49 total pass. `curl` against dev Mongo with real tags (`travel,homesteading,hive`) returned real matched candidates (e.g. a snap tagged `canada,travel` matched `travel`; one tagged `garden,photography` matched `homesteading` via the `garden` synonym). Cold request 5.2s, warm (cached) repeat request 18ms — cache confirmed hit. No-tags request degrades to `{items:[],hasMore:false}`. Offset pagination confirmed continuous, no dupes/gaps. `tsc --noEmit`, `pnpm build` clean.

### Phase 5 — complete, verified (2026-07-08)
- `hooks/useTrendingFeed.ts` — added optional `extraQuery` (query-string fragment, e.g. `tags=...&username=...`), so the same paginated hook drives both cold and warm pools without a new hook file.
- `lib/discovery/snapTrending.ts` — exported `isSnapieCommunityPost` (was private) for the cosmetic badge.
- `components/shared/SnapieCommunityBadge.tsx` — new, structural copy of `WaveBadge`/`TrendingBadge`. Wired into `components/homepage/Snap.tsx` alongside the existing badge checks — decorative only, independent of ranking state.
- `app/page.tsx` — `isColdStart = interestsOnboardedAt === null || interestTags.length === 0`; `isForYouCold`/`isForYouWarm` branch `activeFeedData` between `forYouColdFeed` (existing Phase 1 pool) and a new `forYouWarmFeed` (`useTrendingFeed` pointed at `/api/discovery/foryou-warm`, `extraQuery` carrying `tags`+`username` sourced from `useUserSettings()`). `useSnaps`'s `skip` extended accordingly. Filter value stays `'community'` — only its gated behavior branches further.
- Verified live in browser as `@snapieapp`: onboarded-but-empty-tags correctly stayed on `foryou-candidates` (cold) rather than hitting the warm route with an empty tag list; setting real `interestTags` (`travel,homesteading,hive`) via localStorage flipped the network call to `foryou-warm?tags=travel%2Chomesteading%2Chive&username=snapieapp` and rendered real cross-community matches (e.g. a non-Snapie snap tagged `#canada #travel`, another tagged `#hive #coingecko`); cold state confirmed rendering the `SNAPIE` badge on every item (as expected, since cold is community-scoped by definition). `tsc --noEmit`, `pnpm test` (49/49), `pnpm build` all clean.

## Discovery Engine Phase 2 — all 5 phases complete (2026-07-08)
"For You" is now a real 3-state personalized feed (cold: community-scoped + engagement-ranked; warm: cross-community snaps+waves ranked by hashtag-matched interest + engagement; cosmetic Snapie badge in both states), still fully gated behind the existing flag + `meno`/`snapieapp` allowlist — zero behavior change for anyone else. Notable pivot along the way: Combflow turned out not to classify snaps/waves at all (only top-level posts, confirmed directly), so warm-state categorization uses lightweight hashtag/keyword matching instead of Combflow for snap/wave content — a deliberate, user-approved scope-down from the original plan to avoid building a real classifier. The Combflow category cache (Phase 3) stays in the codebase, tested and working, on the shelf for a possible future "broaden to real posts" phase.

### Follow-up — Blog default tab + blended Long Reads sidebar (2026-07-08)
Plan: `/home/meno/.claude/plans/radiant-yawning-kernighan.md`. Part 1: Blogs defaults to "For You" for allowlisted accounts, with a graceful cold-state fallback (Snapie-community content instead of an empty screen) when no interests picked yet. Part 2: "Long Reads" sidebar blends Community + Trending (everyone) + For You (allowlisted w/ interests), reusing `interleaveCandidates`.
- [x] Part 1 — `app/blog/page.tsx` cold-state fallback + default-tab effect
- [x] Part 2 — `components/layout/RightSideBar.tsx` blended sourcing + interleave

### Review (2026-07-08)
- **Part 1**: `app/blog/page.tsx` — cold "For You" (no `interestTags`) now falls through to the same fetch path as "Snapie" instead of an empty screen, with a small inline hint (not a blocking empty-state) linking to Settings. Default tab is now `'foryou'` for allowlisted accounts, set once via a guarded effect that never fights a manual tab switch afterward (`handleFeedSourceChange` wrapper marks the guard on any manual click, not just the auto-effect).
- **Part 2**: `components/layout/RightSideBar.tsx` — added two small one-time candidate fetches on mount (Trending: `findPosts('trending', {tag, limit:4})`, ungated; For You: existing `/api/discovery/blog-foryou`, gated by allowlist+interests), merged/deduped, mute-filtered against the same `mutedSetRef` the base fetch already populates (the raw `findPosts('trending', ...)` call has no server-side mute filtering, unlike `blog-foryou` — added client-side filtering to match). Spliced into the existing chronological Community base exactly once via the already-built `interleaveCandidates` (`lib/discovery/interleave.ts`), guarded so later infinite-scroll pages stay plain chronological.
- Verified live in browser as `@snapieapp`: Blogs opens directly on "For You"; clearing interests still opens "For You" but shows Snapie-community content with the inline hint (not empty); restoring interests shows real personalized content again. Home page Long Reads: confirmed via DOM inspection that the exact Trending/For-You candidates (`@paultactico2`, `@sps.dao`, `@khingaddy`) appear interleaved among the chronological Community authors — blend confirmed working end-to-end, not just by absence of errors.
- `tsc --noEmit`, `pnpm test` (54/54), `pnpm build` all clean.

### Bug fix — duplicate posts in Long Reads (2026-07-09)
User caught it live: "A wolverine?" post rendering twice. Investigated with Playwright (initial diagnostic script was itself misleading — grabbed the wrong `<a>` per card, avatar-profile-link instead of the post-permlink link, which looked like false-positive dupes; corrected by selecting the post link specifically, i.e. `href` with >2 path segments).
- **Root cause**: `RightSideBar.tsx`'s `fetchPosts()` never had persistent dedup memory across appends — not within its own internal multi-page while-loop, not across separate scroll-triggered calls, and (newly, from this session's blend work) not against posts already spliced in by `interleaveCandidates`. A candidate interleaved in early could get re-appended later once the base's own chronological cursor naturally walked past that same post. Every other paginated hook in this codebase (`useSnaps`, `useBlendedFeed`, `useTrendingFeed`) already guards against exactly this with a persistent `seenPermlinksRef` — this component never had one.
- **Fix**: added `seenKeysRef` (author/permlink composite keys, more precise than `interleaveCandidates`' own permlink-only dedup), checked and updated on every append path: the base fetch's internal loop, and the interleave splice (registers ALL candidates, including ones `interleaveCandidates` itself decided not to insert because they were already in the base — belt and suspenders). Reset alongside the existing mute-list reset effect.
- Verified: heavy scroll-triggered fetching (10 forced scroll-to-bottom cycles) produced 98 cards / 98 unique post hrefs, zero duplicates — confirmed via a corrected DOM-inspection script, not just "no visible dupe in a screenshot."
- `tsc --noEmit`, `pnpm test` (54/54), `pnpm build` all clean.

### Follow-up — hardened Blog page pagination with the same fix (2026-07-09)
User asked to proactively harden `app/blog/page.tsx` too, since it shared the same no-persistent-dedup pattern flagged above.
- Same `seenKeysRef` (author/permlink) pattern added: checked + updated in both the main `findPosts`/`findFeedPosts` branch (Snapie/Following/Trending) and the warm For You branch (`/api/discovery/blog-foryou`), reset alongside the existing tab/search reset effect. The search branch already had its own local per-call dedup (results are replaced wholesale, not appended, so no cross-call accumulation risk there) — left unchanged.
- Verified live with heavy forced scrolling (6-12 cycles) across all three real tabs via a corrected DOM script (selects the post-permlink link specifically, not the first `/@author` link, which caused a false-positive reading during the sidebar investigation): Trending 40/40 unique, Snapie 100/100 unique, For You 2/2 unique (matches the already-known honest yield for that tag combo). Zero duplicates on any tab.
- `tsc --noEmit`, `pnpm test` (54/54), `pnpm build` all clean.

### Follow-up — blog cards show a body snippet, like mobile (2026-07-09)
User pointed at the mobile app's reference implementation: `/home/meno/Documents/menosoft/hivesnaps/app/components/BlogCard.tsx`. Confirmed `components/blog/PostCard.tsx` already computed a plain-text `snippet` (same idea as mobile's `buildExcerpt`) but only ever rendered it when `compact` was true — which is only passed during search, so every normal listing (Blog grid, Long Reads sidebar) never showed it, title+picture only.
- Un-gated the snippet render from `compact` — now shows everywhere (`noOfLines={2}` in normal cards which also carry an image; kept `noOfLines={3}` in compact/search cards, which have no image and more room).
- Improved the stripping regex to also remove heading/emphasis/code/blockquote markup (`#`, `*_~\``, `>`), matching mobile's `buildExcerpt` — the old regex only hid image/link syntax, leaving stray markdown punctuation visible in the text.
- Verified live: Blog grid (Snapie tab), Long Reads sidebar, and search results (compact mode) all show clean 2-3 line excerpts; confirmed compact/search mode is structurally unaffected (still 3 lines, still no image).
- `tsc --noEmit`, `pnpm test` (54/54), `pnpm build` all clean.

### Follow-up — snippet still showing raw markdown, three real bugs (2026-07-09)
User reported still seeing it after the above. Initially misread as the earlier duplicate-posts bug (asked a clarifying question — screenshot showed something entirely different: a raw, unclosed `! [images (18).jpeg](` fragment in a snippet, not a duplicate). Investigated with real Hive post bodies (not synthetic examples) and found three separate, real gaps:
1. **Stray whitespace in source markdown** — some posts write `! [alt] (url)` (space after `!`, space before `(`) instead of canonical `![alt](url)`; the tight regex required exact adjacency and left the raw fragment in place. Fixed: `!\s*\[...\]\s*\(...\)` (and the same for plain links) tolerates the whitespace.
2. **Markdown table syntax** — a post built as an image gallery table (`| ![img](url) |` rows, `| - |` separator rows) left literal `|` pipe characters and separator artifacts once cell contents were stripped. Fixed: strip `|` characters. (Titles legitimately use `|` as a stylistic separator, e.g. "Subtitle | Series Name" — confirmed this is untouched since titles render separately from the body-derived snippet.)
3. **Root cause of the original report**: search results source their `body` from a *separate external service* (`hivesense-api`, not this app's own Hive calls), called with `truncate: 320` (`lib/hive/client-functions.ts:searchPosts` → `app/blog/page.tsx`). That service's truncation is a plain character cut, not markdown-aware, and can land mid-tag — producing a fragment with no closing `)` at all, which no client-side regex can ever repair since the closing bracket is already gone before this app sees the string. Fixed by requesting `truncate: 0` (untruncated) and letting `PostCard`'s own stripping + CSS `noOfLines` clamp handle the visual truncation on complete text, the same way every non-search path already works.
- Applied the same hardening to `lib/utils/buildMetadata.ts:stripMarkdown` (SEO meta descriptions) since it's the identical class of bug in the same repo — a third, independent near-duplicate of this regex existed there.
- Verified against the two real posts that exposed these bugs (fetched their actual raw bodies from Hive, not assumptions): both render clean now, confirmed live in the browser post-fix. Re-swept Long Reads sidebar (73 cards, heavy scroll) for any remaining raw markdown/HTML/URL leakage — none found; the only "|" matches were legitimate title text, not snippet artifacts.
- `tsc --noEmit`, `pnpm test` (54/54), `pnpm build` all clean.

### Follow-up — Blog "For You" (real-post interest matching, 2026-07-08) — COMPLETE
Plan: `/home/meno/.claude/plans/radiant-yawning-kernighan.md`. Puts Phase 3's unused Combflow category cache to work on the Blogs page instead of the home feed (real posts don't render acceptably through `Snap.tsx` — no title, no truncation, confirmed by reading the code). New "For You" tab on Blogs, same allowlist gate, reuses the same `interestTags` from Settings.
- [x] `lib/discovery/postInterestPool.ts` — raw pool + tag-keyed ranked cache + `fetchPostInterestCandidates`
- [x] `app/api/discovery/blog-foryou/route.ts`
- [x] `components/blog/TopBar.tsx` — 4th tab, gated
- [x] `app/blog/page.tsx` — wiring, empty-state

**Bug caught during verification, not guessed around**: `lib/discovery/postInterestPool.ts` initially reused `findPosts` from `lib/hive/client-functions.ts` for sourcing candidates — that file has `'use client'` at the top (it also imports Aioha wallet code). Importing it from a server-side API route doesn't throw at import time; Next.js's server bundler instead swaps the export for a non-callable stand-in, so calling it throws `TypeError: findPosts is not a function`, which the route's own try/catch silently swallowed to `{items:[],hasMore:false}` — a real "for you" tab that would have always shown empty in production with zero errors anywhere. Caught by curl-testing before wiring the UI (per the established verification discipline), not by assumption. Fixed by calling `bridge.get_ranked_posts` directly via the isomorphic `HiveClient` from `lib/hive/hiveclient.tsx` instead (same pattern `snapTrending.ts` already uses server-side).
Also excluded the daily `peak.snaps`/`ecency.waves` container-scaffold posts from the candidate pool — they're genuine top-level posts (pass every filter) but are empty scaffolding with nothing to personalize around; caught live in a test response.
Verified: 5 new unit tests (`postInterestPool.test.ts`, 54/54 total), curl against dev Mongo (cold 15.2s / warm cache 14ms, real matched posts spot-checked), live browser as `@snapieapp` — "For You" tab shows real cross-community posts (proper title/snippet/cover-image via existing `PostCard.tsx`) matching `gaming`/`music` interests reused directly from the Settings work, empty-interests state links to Settings and the link works, `hasMore:false` correctly stops infinite-scroll for a narrow tag combo (3 honest matches, not a bug). `tsc --noEmit`, `pnpm build`, `pnpm test` all clean.

### Follow-up — edit interests from Settings (2026-07-08)
Gap found post-launch: once onboarded, there was no way to ever revisit/change `interestTags` short of manually clearing localStorage.
- `components/onboarding/InterestPicker.tsx` — added `mode?: 'onboarding' | 'edit'`. Edit mode pre-populates selection from current `interestTags`, shows an X/close button, allows overlay-click/Esc dismiss, and "Cancel" closes **without calling `update()` at all** (deliberately distinct from "Skip," which stamps an empty array — Cancel must never silently wipe an existing selection).
- `app/settings/page.tsx` — new "Discovery" section (same `isDiscoveryEnabledFor` gate as everywhere else), shows current interests as chips or an empty-state message, "Choose/Edit interests" button opens `InterestPicker` in edit mode.
- Verified live in browser as `@snapieapp`: picker opens pre-populated with existing selections, Save round-trips to localStorage correctly, chips update on the Settings page immediately, Cancel (after making unsaved changes) leaves `interestTags`/`interestsOnboardedAt` completely untouched.
- Caught at build time (not typecheck): two unescaped `"` in raw JSX text tripped `react/no-unescaped-entities` — `tsc --noEmit` doesn't catch this, only `pnpm build`'s lint step does. Fixed, confirmed clean build after.
- `tsc --noEmit`, `pnpm test` (49/49), `pnpm build` all clean.

### Widened to all users + grand plan doc (2026-07-09)
User's call: mechanisms verified against real data, rollback is a one-line flag flip, bugs found so far were cosmetic — widen now, let real usage (and real users) surface anything left rather than more solo testing.
- `lib/discovery/config.ts` — `isDiscoveryEnabledFor` no longer checks an allowlist, only the feature flag + a logged-in username (`DISCOVERY_ALLOWED_USERNAMES` deleted, confirmed dead — every call site already handled the false case gracefully for logged-out visitors, verified by reading all 5 usages before changing). Behavior for `meno`/`snapieapp` is unchanged; every other logged-in user now gets the same experience.
- New `internal-docs/discovery-engine-grand-plan.md` — standing reference for the whole initiative: the original 5-part vision, what's actually shipped, known real gaps (waves never verified — local sidecar was never reachable during this build; no engagement metrics exist; mobile untested on the Blog "For You" tab and Settings), what was deliberately deferred, and content resurrection scoped as the next phase (needs per-candidate reply timestamps for a burst-vs-baseline signal — the current lifetime `children/age` velocity score structurally can't tell "dead" from "having a moment right now").
- Full regression pass before flipping: `tsc --noEmit`, `pnpm test` (54/54), `pnpm build` all clean.
- **Still outstanding, not done by me**: the actual production deploy (this session only ever ran `pnpm dev`/`pnpm build` locally on port 3310 — never confirmed access to the real production host or its `NEXT_PUBLIC_ENABLE_DISCOVERY_SNAPS` env value).

### Env doc gap fixed (2026-07-09)
`NEXT_PUBLIC_ENABLE_DISCOVERY_SNAPS` was never added to `.env.local.example` (the tracked template) — added with a comment noting it's build-time (requires rebuild + pm2 restart, not just a server restart), matching the existing `NEXT_PUBLIC_ENABLE_BLENDED_FEED` documentation pattern. Committed + pushed.

### Bug fix — old snap payout showing $0.00 (2026-07-09)
User-reported, unrelated to Discovery Engine: an 8-day-old snap by @beelzael showed $0.00 instead of its real payout. Same class of bug as an earlier "blogs older than 7 days" fix, but that fix has its own latent gap.
- **Root cause**: `getPayoutValue` (`lib/hive/client-functions.ts`) picks `total_payout_value` vs `pending_payout_value` based on whether `Date.now() - new Date(post.created).getTime()` is ≥ 7 days. Hive's `created` timestamps omit the trailing `Z`, so `new Date(post.created)` parses them as the **viewer's local time**, not UTC. Confirmed directly against this exact snap's real data (`created: 2026-07-01T23:13:24`, true UTC age 7.16 days, `total_payout_value: 0.252 HBD`, `pending_payout_value: 0.000 HBD` — already zeroed out since the window really has closed): on this UTC-5 system the local-parsed age computed as 6.95 days, landing just under the cutoff, so it read the now-empty `pending_payout_value` instead of the real `0.252`. `lib/utils/GetPostDate.ts` already had the correct UTC-normalization fix for this exact Hive quirk — `getPayoutValue` just never got it.
- **Fix**: append `Z` to `post.created` before parsing, mirroring `GetPostDate.ts`'s existing pattern exactly.
- New `lib/hive/client-functions.test.ts` (first test file for this module).

**Follow-up, same session**: user noticed the fixed value ($0.252) still didn't match PeakD ($0.50) on this exact post. Real second bug: `getPayoutValue`'s post-cashout branch returned `total_payout_value` alone, which is only the **author's** share — post-cashout, Hive splits the full pot into `total_payout_value` (author) + `curator_payout_value` (curators). Confirmed against the exact numbers: `0.252 + 0.251 = 0.503`, matching PeakD's $0.50 precisely. Fixed by summing both fields (the pending-payout branch was already correct — `pending_payout_value` is the whole pre-split pot, no addition needed there). Updated the 2 affected tests to expect the summed total using the real numbers, added a third test for a missing `curator_payout_value` defaulting to zero (no NaN). 6 tests total now.
- Verified live against the real post again: now shows $0.503, matching PeakD.
- `tsc --noEmit`, `pnpm test` (60/60), `pnpm build` all clean.

---

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

---

# Fix — Unbounded reply-nesting indentation (2026-07-03)

## Problem
Deeply nested conversations (reply→reply→reply→…) rendered comically narrow comment cards — at 29 levels deep the card was 34px wide on a 390px phone (seen on /@meno/20260702t010620059z).

## Root cause
`components/homepage/Snap.tsx` renders replies recursively; every level wraps children in a Box with `pl={1} ml={2}` (~12px), compounding without limit.

## Change
- MOD `components/homepage/Snap.tsx` — added `MAX_INDENT_LEVEL = 3`; the indent is only applied for levels 1–3, so deeper replies render flush with their level-3 ancestor (same order, same parent grouping). One shared component fixes snaps conversations, the home feed, and blog-post comments alike.

## Verification
- Dev server + Playwright (chromium) at 390px viewport on the reported conversation:
  - Before: 29 distinct indent offsets, narrowest card **34px**.
  - After: 4 distinct offsets (16/28/40/52px), narrowest card **322px**.
- Screenshots confirmed deep replies are fully readable at mobile width.

---

# Plan — Blogs section: feed-source tabs (2026-07-03)

## Goal
Blog page gets a source selector like peakd: **Snapie** (community, default) / **Following** (logged-in user's follow feed) / **Trending** (global Hive). Nav label "Blog" → "Blogs".

## Decisions (confirmed with meno)
- Following tab always visible; logged out → login prompt.
- Trending = global Hive trending (community trending stays as sort pill on Snapie tab).
- Sort pills (New/Hot/Trending/Top) only shown on the Snapie tab.

## Steps
- [x] `lib/hive/client-functions.ts`: add `findFeedPosts(account, params)` — bridge `get_account_posts` sort `feed`, cursor pagination.
- [x] `components/blog/TopBar.tsx`: add source tab row (Snapie/Following/Trending); hide sort pills unless source is snapie.
- [x] `app/blog/page.tsx`: `feedSource` state; fetch branches (snapie = current, following = feed by username, trending = ranked trending with empty tag); reset pagination on source change; login-prompt state for Following when logged out.
- [x] Rename Blog → Blogs in `Sidebar.tsx`, `BottomTabBar.tsx`, `FooterNavigation.tsx`.
- [x] Verify in dev server with Playwright: all three tabs, logged-out prompt, simulated login via localStorage.

## Review
- Snapie tab unchanged (default): community posts load, all four sort pills visible.
- Trending tab: global Hive trending via bridge `get_ranked_posts` with empty tag; sort pills hidden.
- Following tab: logged out shows a "log in to see your feed" prompt; logged in (simulated via `aiohaUsername`/`aiohaProvider`/`hiveuser` localStorage) loads meno's real follow feed — verified it matches peakd (@sportsblock, @ericvancewalton, @wiseagent…). Infinite scroll verified: 5 paginated RPC calls with advancing `start_author`/`start_permlink` cursors, 426 post links loaded.
- Note: `LoginModalContext` clears `hiveuser` unless an Aioha/Snapie session exists — simulating login requires setting the Aioha keys too.
- Nav renamed Blog → Blogs in Sidebar, BottomTabBar, FooterNavigation (labels + tooltips; route stays `/blog`).
- `tsc --noEmit` clean.
