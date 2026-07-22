'use client';
import HiveClient from './hiveclient';
import { KeyTypes, broadcastOps } from './aioha';

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
}

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
}

export async function getWitnessesByVote(limit = 100): Promise<WitnessInfo[]> {
  const result = (await HiveClient.call('condenser_api', 'get_witnesses_by_vote', ['', limit])) as any[];
  return result.map((w, i) => ({
    rank: i + 1,
    owner: w.owner,
    url: w.url,
    votes: w.votes,
    totalMissed: w.total_missed ?? 0,
    version: w.running_version ?? '',
    isActive: w.signing_key !== NULL_WITNESS_KEY,
  }));
}

export async function getActiveProposals(limit = 50): Promise<ProposalInfo[]> {
  const result = (await HiveClient.call('database_api', 'list_proposals', {
    start: [-1],
    limit,
    order: 'by_total_votes',
    order_direction: 'descending',
    status: 'active',
  })) as { proposals: any[] };
  return result.proposals.map((p) => ({
    id: p.proposal_id ?? p.id,
    creator: p.creator,
    receiver: p.receiver,
    subject: p.subject,
    permlink: p.permlink,
    startDate: p.start_date,
    endDate: p.end_date,
    dailyPayHbd: Number(p.daily_pay.amount) / 10 ** p.daily_pay.precision,
    totalVotes: p.total_votes,
  }));
}

/** Proposal ids this account currently has an active vote on. Fetched
 *  separately from getActiveProposals because the chain doesn't store a
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
  const op = ['update_proposal_votes', { voter: username, proposal_ids: proposalIds, approve, extensions: [] }];
  const out = await broadcastOps([op], KeyTypes.Active, `${approve ? 'Approve' : 'Remove'} proposal vote`);
  return { success: true as const, result: out.result };
}
