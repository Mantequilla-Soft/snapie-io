# Lessons

## Shorts / 3speak metadata
- **Don't trust Hive `json_metadata.image`/`title` for 3speak shorts.** Snaps (snapie-mobile) and many shorts have empty `image: []` and `title: ""`. The reliable source is the 3speak watch API: `https://play.3speak.tv/api/watch?v=<author>/<videoPermlink>` → `{ success, title, thumbnail, videoUrl }`.
- **A short has two permlinks.** `short.hivePermlink` (the Hive post, for votes/comments, parsed from `embed_url`) ≠ `short.permlink` (the 3speak video permlink, used by the player's `usePlayer({ autoLoad })`). For snaps they differ (`snap-…` vs `3cb3gaih`); for legacy 3speak posts they're equal. Recover the video permlink from the Hive post's `json_metadata.video.url` (`…/embed?v=author/<videoPermlink>`).
- When a feature shares a link to a short, the canonical id is the **hive permlink** (needed for votes/comments); resolve the video permlink + thumbnail server-side.
