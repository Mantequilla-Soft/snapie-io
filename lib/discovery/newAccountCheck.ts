import { getUserReputation } from '@/lib/utils/reputation';

// A small buffer above Hive's literal starting reputation (25) so a couple of
// early votes don't wrongly disqualify someone who's still clearly brand new.
export const NEW_ACCOUNT_REP_THRESHOLD = 30;

/** Whether `username` is a freshly created Hive account (as opposed to an
 *  established account that's simply new to Snapie) — used to decide whether
 *  the interest-picker onboarding prompt is relevant. Deliberately reuses
 *  getUserReputation() (already proven for spam filtering elsewhere) rather
 *  than condenser API's `get_accounts().reputation`, which returns 0/unset on
 *  real nodes — the human-scale reputation actually lives behind Hive's
 *  reputation-api, not the account record itself. Note getUserReputation
 *  fail-opens to 25 on a lookup error (an already-accepted tradeoff for that
 *  helper), so a rare API hiccup could show the prompt once to an account
 *  it doesn't really apply to — low stakes, not worth special-casing. */
export async function isNewHiveAccount(username: string): Promise<boolean> {
  const reputation = await getUserReputation(username);
  return reputation <= NEW_ACCOUNT_REP_THRESHOLD;
}
