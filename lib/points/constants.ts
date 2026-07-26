export type PointsActionType = 'blog' | 'snap' | 'comment' | 'reblog' | 'vote';

export const POINTS_ACTION_TYPES: PointsActionType[] = ['blog', 'snap', 'comment', 'reblog', 'vote'];

// Ledger action types are a superset of the earn types: 'purchase' and
// 'admin_grant' also write a PointsLedger row (for one shared audit trail),
// but have no fixed POINTS/DAILY_CAP entry — their point value is derived
// per-transaction (verified transfer amount, or an admin's typed amount),
// not a per-action constant, so they're kept out of the earn-only maps below
// rather than forcing an unused dummy entry.
export type LedgerActionType = PointsActionType | 'purchase' | 'admin_grant';

export const LEDGER_ACTION_TYPES: LedgerActionType[] = [...POINTS_ACTION_TYPES, 'purchase', 'admin_grant'];

// Per-grant ceiling for the admin "points cannon" — generous enough for a
// real customer-service comp, low enough that a fat-fingered extra zero
// can't mint a game-breaking amount. Not a rate limit (an admin can grant
// this many, to as many users, as often as they want) — just a single-typo
// guardrail.
export const MAX_ADMIN_GRANT_POINTS = 5000;

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
