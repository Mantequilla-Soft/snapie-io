import { PointsAccount } from '@/lib/db/models/PointsAccount';

/** Shared by every points-spend service (badges, roulette, the item market)
 *  — previously copy-pasted verbatim in each one. */
export async function currentBalance(username: string): Promise<number> {
  const acct = await PointsAccount.findById(username).lean();
  return acct?.balance ?? 0;
}
