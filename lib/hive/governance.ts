'use client';
import HiveClient from './hiveclient';
import { KeyTypes, broadcastOps } from './aioha';
import { extractNumber } from '../utils/extractNumber';

// Witnesses set their signing key to this well-known null pubkey to signal
// they've voluntarily disabled block production — they still show up in
// get_witnesses_by_vote (and can still hold votes) but aren't producing.
const NULL_WITNESS_KEY = 'STM1111111111111111111111111111111114T1Anm';

export interface WitnessInfo {
  rank: number;
  owner: string;
  url: string;
  /** Raw vote weight as returned by the chain — not converted to HP. Not
   *  directly comparable across API calls at different block heights, but
   *  fine for ranking/relative-bar display within a single fetch. */
  votes: string;
  totalMissed: number;
  version: string;
  isActive: boolean;
  /** votes converted from raw VESTS into HP — see getVestsToHiveRatio. */
  supportHp: number;
}

// The chain's built-in "Return Proposal" (always id 0) sits in the same
// vote-ranked list as every real proposal and marks the funding cutoff:
// the DHF pays proposals in vote-rank order until the daily budget runs
// out, and this proposal's rank IS that cutoff line. Everything ranked
// below it is currently unfunded regardless of how many votes it has.
const RETURN_PROPOSAL_ID = 0;

export interface ProposalInfo {
  id: number;
  creator: string;
  receiver: string;
  subject: string;
  permlink: string;
  startDate: string;
  endDate: string;
  dailyPayHbd: number;
  totalVotes: string;
  /** Rough estimate (daily_pay × days elapsed since start, capped at today
   *  or end_date) — the chain doesn't expose actual amounts transferred so
   *  far, only the current daily rate. */
  estPaidHbd: number;
  isFunded: boolean;
  /** start_date is in the future — hasn't entered its funding window yet,
   *  so it can't be "funded" or "unfunded" yet, just voted on in advance. */
  isUpcoming: boolean;
  /** total_votes converted from raw VESTS into HP, same ratio used for the
   *  witness-vote/HP conversions elsewhere — this is what PeakD calls a
   *  proposal's "support". */
  supportHp: number;
  /** The chain's built-in "Return Proposal" (always id 0) — a real,
   *  votable proposal that returns unspent DHF funds to the treasury
   *  instead of funding anything ranked below it. Its own rank in the
   *  vote-sorted list IS the funding cutoff line, so it's kept in the
   *  list (not filtered out) and always treated as funded — voting it
   *  up/down is exactly how people adjust where that line falls. */
  isReturnProposal: boolean;
}

/** VESTS-per-HIVE ratio from current chain state, shared across a single
 *  getWitnessesByVote()/getVotableProposals() call so N items cost one RPC
 *  round-trip instead of N — mirrors client-functions.ts's convertVestToHive,
 *  just batched. */
async function getVestsToHiveRatio(): Promise<number> {
  const globalProps = await HiveClient.call('condenser_api', 'get_dynamic_global_properties', []);
  const totalVestingFund = extractNumber(globalProps.total_vesting_fund_hive);
  const totalVestingShares = extractNumber(globalProps.total_vesting_shares);
  return totalVestingFund / totalVestingShares;
}

export async function getWitnessesByVote(limit = 100): Promise<WitnessInfo[]> {
  const [result, vestsToHive] = await Promise.all([
    HiveClient.call('condenser_api', 'get_witnesses_by_vote', ['', limit]) as Promise<any[]>,
    getVestsToHiveRatio(),
  ]);
  return result.map((w, i) => ({
    rank: i + 1,
    owner: w.owner,
    url: w.url,
    votes: w.votes,
    totalMissed: w.total_missed ?? 0,
    version: w.running_version ?? '',
    isActive: w.signing_key !== NULL_WITNESS_KEY,
    supportHp: (Number(w.votes) / 1_000_000) * vestsToHive,
  }));
}

/** Fetches every proposal still worth voting on: currently-funded ones AND
 *  approved-but-not-started-yet ones (status 'active' alone excludes the
 *  latter entirely — 'votable' is the superset that also includes them).
 *  Upcoming proposals haven't entered their funding window, so they're kept
 *  out of the funding-cutoff math below (which only makes sense among
 *  proposals actually competing for today's DHF budget) and are returned
 *  with isFunded/isUpcoming flags instead so the UI can treat them as a
 *  separate "not started yet" group. */
export async function getVotableProposals(limit = 50): Promise<ProposalInfo[]> {
  const [result, vestsToHive] = await Promise.all([
    HiveClient.call('database_api', 'list_proposals', {
      start: [-1],
      limit,
      order: 'by_total_votes',
      order_direction: 'descending',
      status: 'votable',
    }) as Promise<{ proposals: any[] }>,
    getVestsToHiveRatio(),
  ]);

  const now = Date.now();
  const isUpcoming = (p: any) => new Date(p.start_date).getTime() > now;

  // Cutoff rank is computed only among already-started proposals — an
  // upcoming proposal sitting above the Return Proposal by vote count isn't
  // actually consuming today's budget yet, so it shouldn't push a live
  // proposal below the line.
  const startedProposals = result.proposals.filter((p) => !isUpcoming(p));
  const returnProposalRank = startedProposals.findIndex((p) => (p.proposal_id ?? p.id) === RETURN_PROPOSAL_ID);

  return result.proposals
    .map((p) => {
      const isReturnProposal = (p.proposal_id ?? p.id) === RETURN_PROPOSAL_ID;
      const upcoming = isUpcoming(p);
      const startedIndex = startedProposals.indexOf(p);
      // The Return Proposal defines the cutoff rather than sitting on either
      // side of it — always shown as "funded" since it always does its job
      // (return leftover funds), regardless of where it lands.
      const isFunded = isReturnProposal || (!upcoming && (returnProposalRank === -1 || startedIndex < returnProposalRank));

      const dailyPayHbd = Number(p.daily_pay.amount) / 10 ** p.daily_pay.precision;
      const start = new Date(p.start_date).getTime();
      const end = Math.min(new Date(p.end_date).getTime(), now);
      const elapsedDays = Math.max(0, Math.floor((end - start) / 86_400_000));
      // dailyPayHbd is a chain sentinel (not a real rate) for the Return
      // Proposal, so an elapsed-time estimate off of it would be meaningless.
      const estPaidHbd = isFunded && !isReturnProposal ? dailyPayHbd * elapsedDays : 0;
      const supportHp = (Number(p.total_votes) / 1_000_000) * vestsToHive;

      return {
        id: p.proposal_id ?? p.id,
        creator: p.creator,
        receiver: p.receiver,
        subject: p.subject,
        permlink: p.permlink,
        startDate: p.start_date,
        endDate: p.end_date,
        dailyPayHbd,
        totalVotes: p.total_votes,
        isReturnProposal,
        estPaidHbd,
        isFunded,
        isUpcoming: upcoming,
        supportHp,
      };
    });
}

export function formatHp(hp: number): string {
  if (hp >= 1_000_000) return `${(hp / 1_000_000).toFixed(1)}M HP`;
  if (hp >= 1_000) return `${(hp / 1_000).toFixed(1)}K HP`;
  return `${Math.round(hp).toLocaleString()} HP`;
}

/** Proposal ids this account currently has an active vote on. Fetched
 *  separately from getVotableProposals because the chain doesn't store a
 *  voter's proposal votes on the account object the way witness_votes is —
 *  it's its own indexed table. */
export async function getAccountProposalVotes(username: string): Promise<Set<number>> {
  const result = (await HiveClient.call('database_api', 'list_proposal_votes', {
    start: [username, 0],
    limit: 100,
    order: 'by_voter_proposal',
    order_direction: 'ascending',
    status: 'all',
  })) as { proposal_votes: any[] };
  const ids = new Set<number>();
  for (const v of result.proposal_votes) {
    if (v.voter !== username) continue; // index can run past this voter once exhausted
    ids.add(v.proposal.proposal_id ?? v.proposal.id);
  }
  return ids;
}

export async function proposalVoteBroadcast(username: string, proposalIds: number[], approve: boolean) {
  const { isSnapieMode, emitNeedsWallet } = await import('./signing');
  if (isSnapieMode()) {
    const { proposalVote } = await import('../snapie-auth/client');
    const res = await proposalVote(proposalIds, approve);
    if ('needsClientSigning' in res) { emitNeedsWallet(); throw Object.assign(new Error('Connect your Hive wallet to vote on proposals'), { code: 'needs_client_signing' }); }
    if (res.emancipationRequired && typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('snapie:emancipation-required'));
    return { success: true as const, result: res.txId };
  }
  const op = ['update_proposal_votes', { voter: username, proposal_ids: proposalIds, approve, extensions: [] }];
  const out = await broadcastOps([op], KeyTypes.Active, `${approve ? 'Approve' : 'Remove'} proposal vote`);
  return { success: true as const, result: out.result };
}
