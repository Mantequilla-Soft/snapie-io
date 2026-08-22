import { connectDB } from '@/lib/db/mongodb';
import { PointsLedger } from '@/lib/db/models/PointsLedger';
import { RouletteSpin } from '@/lib/db/models/RouletteSpin';
import { MoodBadgePurchase } from '@/lib/db/models/MoodBadgePurchase';
import { MOOD_BADGES, MoodBadgeSku } from '@/lib/moodBadges/constants';

export type TransactionType = 'earn' | 'purchase' | 'admin_grant' | 'roulette' | 'badge_purchase';

export interface PointsTransaction {
  type: TransactionType;
  label: string;
  /** Signed: positive = credited, negative = debited. */
  delta: number;
  createdAt: Date;
}

const EARN_LABELS: Record<string, string> = {
  blog: 'Earned for a blog post',
  snap: 'Earned for a snap',
  comment: 'Earned for a comment',
  reblog: 'Earned for a reblog',
  vote: 'Earned for a vote',
};

/** Unifies three disconnected points-activity sources (PointsLedger,
 *  RouletteSpin, MoodBadgePurchase — see the marketplace roadmap doc for why
 *  each got its own collection instead of a shared one) into one
 *  chronological feed, most recent first.
 *
 *  Fetches `limit` rows from EACH source before merging, not fewer — the
 *  true top-N overall can include at most N rows from any single source
 *  (there's no scenario needing more than N from one source to assemble it),
 *  so fetching less than `limit` from any one source risks silently
 *  dropping real entries (e.g. 10 roulette spins all newer than every
 *  ledger row, but only 4 fetched from RouletteSpin, would wrongly drop 6).
 *
 *  Three plain queries + an in-app merge, not a $unionWith aggregation —
 *  nothing else in this codebase uses aggregation pipelines, and this keeps
 *  each source trivially fake-able in tests with the same
 *  find().sort().limit().lean() mock idiom already used elsewhere. */
export async function getRecentTransactions(username: string, limit = 10): Promise<PointsTransaction[]> {
  await connectDB();

  const [ledgerRows, spinRows, badgeRows] = await Promise.all([
    PointsLedger.find({ username }).sort({ createdAt: -1 }).limit(limit).lean(),
    RouletteSpin.find({ username }).sort({ createdAt: -1 }).limit(limit).lean(),
    MoodBadgePurchase.find({ username }).sort({ createdAt: -1 }).limit(limit).lean(),
  ]);

  const transactions: PointsTransaction[] = [
    ...ledgerRows.map((row): PointsTransaction => {
      if (row.actionType === 'purchase') {
        return { type: 'purchase', label: 'Bought points with HBD', delta: row.points, createdAt: row.createdAt };
      }
      if (row.actionType === 'admin_grant') {
        return { type: 'admin_grant', label: 'Points grant', delta: row.points, createdAt: row.createdAt };
      }
      return { type: 'earn', label: EARN_LABELS[row.actionType] ?? `Earned for a ${row.actionType}`, delta: row.points, createdAt: row.createdAt };
    }),
    ...spinRows.map((row): PointsTransaction => ({
      type: 'roulette',
      label: row.multiplier === 0 ? 'Roulette spin — lost' : `Roulette spin — ${row.multiplier}x`,
      delta: row.payout - row.stake,
      createdAt: row.createdAt,
    })),
    ...badgeRows.map((row): PointsTransaction => ({
      type: 'badge_purchase',
      label: `Bought ${MOOD_BADGES[row.sku as MoodBadgeSku]?.label ?? row.sku} badge`,
      delta: -row.price,
      createdAt: row.createdAt,
    })),
  ];

  transactions.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  return transactions.slice(0, limit);
}
