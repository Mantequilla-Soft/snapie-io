/**
 * Calculates the estimated HBD value of a vote.
 *
 * Formula (post-HF20): voting power does NOT affect dollar value — only
 * effective VESTS and the weight slider do.
 *
 *   rshares        = effectiveVests * 1e6 * (weight / 100) / 50
 *   voteValueHIVE  = (rshares / recentClaims) * rewardBalance
 *   voteValueHBD   = voteValueHIVE * medianPrice
 */
export function calculateVoteValue(
  account: any,
  rewardFund: { recent_claims: string; reward_balance: string },
  voteWeight: number, // 0–100 (slider percentage)
  medianPrice: number // HBD per HIVE
): number {
  const parseVests = (v: any): number => {
    if (!v) return 0;
    return parseFloat(typeof v === 'string' ? v : String(v));
  };

  const effectiveVests =
    parseVests(account.vesting_shares) +
    parseVests(account.received_vesting_shares) -
    parseVests(account.delegated_vesting_shares);

  const weightFraction = Math.min(Math.max(voteWeight / 100, 0), 1);
  const rshares = (effectiveVests * 1e6 * weightFraction) / 50;

  const recentClaims = parseFloat(rewardFund.recent_claims);
  const rewardBalance = parseFloat(rewardFund.reward_balance);

  if (!recentClaims || !rewardBalance) return 0;

  const voteValueHIVE = (rshares / recentClaims) * rewardBalance;
  return voteValueHIVE * medianPrice;
}
