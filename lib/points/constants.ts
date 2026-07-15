export type PointsActionType = 'blog' | 'snap' | 'comment' | 'reblog' | 'vote';

export const POINTS_ACTION_TYPES: PointsActionType[] = ['blog', 'snap', 'comment', 'reblog', 'vote'];

// Award values. Server-authoritative — the client never sends an amount, it only
// names the action, and the server resolves the points here.
export const POINTS: Record<PointsActionType, number> = {
  blog: 10,
  snap: 3,
  comment: 2,
  reblog: 2,
  vote: 1,
};

// Per-user, per-UTC-day caps. Actions absent from this map are uncapped. Caps
// exist for the cheap/loosely-attributed actions (comment/reblog/vote) to blunt
// farming; blog/snap are naturally rate-limited by the effort of writing them.
export const DAILY_CAP: Partial<Record<PointsActionType, number>> = {
  comment: 10,
  reblog: 5,
  vote: 20,
};

// The Hive container account a Snapie "snap" is posted under (snaps are comments
// on this account's container posts). Used to sanity-check snap attribution.
export const SNAP_CONTAINER_AUTHOR = 'peak.snaps';
