/**
 * OpenAttribute self-describing content-type markers — see
 * internal-docs/open-attribute-snapie-setup.md. Registered once with the
 * @snapie account, then written into every post/comment's json_metadata so
 * any Hive app can recognize Snapie content by key alone, without working
 * out e.g. that a "snap" is actually a comment on a rotating peak.snaps
 * container post.
 */
export type SnapOpenAttributeKey = 'snapie.snap' | 'snapie.reply';

/**
 * `isNewSnap` mirrors the same `pp === 'snaps'` sentinel SnapComposer.tsx
 * already resolves to the real container permlink — every other case is a
 * reply to something that already exists (a snap, a blog post's comment
 * thread, a Shorts comment).
 */
export function snapOpenAttributeKey(isNewSnap: boolean): SnapOpenAttributeKey {
    return isNewSnap ? 'snapie.snap' : 'snapie.reply';
}
