# Lessons

## Local dev server broadcasts real Hive transactions
- The local dev server (`npm run dev`, port 3310) is logged in as a real account (`@snapieapp`) with live credentials — it is **not** a sandboxed/testnet session. Clicking any action that broadcasts (follow, subscribe, vote, post, transfer, etc.) while verifying a UI change signs and submits a real, permanent, public Hive blockchain transaction, not a mock.
- Before clicking a broadcast-triggering button during verification, pause and consider whether the action is reversible in effect (e.g. a subscribe/follow toggle) vs. truly irreversible (e.g. a transfer, a vote, a published post) — and prefer reading the code path over clicking through the live UI when the action can't be undone. If a reversible action gets triggered accidentally, flag it to the user immediately rather than silently reverting it yourself.

## Shorts / 3speak metadata
- **Don't trust Hive `json_metadata.image`/`title` for 3speak shorts.** Snaps (snapie-mobile) and many shorts have empty `image: []` and `title: ""`. The reliable source is the 3speak watch API: `https://play.3speak.tv/api/watch?v=<author>/<videoPermlink>` → `{ success, title, thumbnail, videoUrl }`.
- **A short has two permlinks.** `short.hivePermlink` (the Hive post, for votes/comments, parsed from `embed_url`) ≠ `short.permlink` (the 3speak video permlink, used by the player's `usePlayer({ autoLoad })`). For snaps they differ (`snap-…` vs `3cb3gaih`); for legacy 3speak posts they're equal. Recover the video permlink from the Hive post's `json_metadata.video.url` (`…/embed?v=author/<videoPermlink>`).
- When a feature shares a link to a short, the canonical id is the **hive permlink** (needed for votes/comments); resolve the video permlink + thumbnail server-side.
