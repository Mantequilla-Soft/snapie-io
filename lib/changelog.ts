export type ChangelogItemType = 'feature' | 'improvement' | 'fix';

export interface ChangelogItem {
  type: ChangelogItemType;
  text: string;
}

export interface ChangelogEntry {
  /** Stable, sortable id — always the calendar date in YYYY-MM-DD form so it
   *  sorts lexically and so all of a single day's changes live under ONE entry.
   *  Push three times in a day? Append three items here, don't add three
   *  entries — that's what keeps the "once a day, enough" behaviour (see
   *  WhatsNewModal). */
  id: string;
  /** ISO date (same as id today), kept separate in case display formatting
   *  ever needs a real timestamp. */
  date: string;
  /** Optional headline for the day, shown next to the date. */
  title?: string;
  items: ChangelogItem[];
}

// Newest first. Add a new dated entry (or append items to today's) whenever a
// user-facing change ships. Keep it human and skip trivial/internal pushes —
// only things a user would actually notice belong here.
export const CHANGELOG: ChangelogEntry[] = [
  {
    id: '2026-07-22',
    date: '2026-07-22',
    items: [
      { type: 'feature', text: 'New Governance section in Settings — vote for Hive witnesses and Decentralized Hive Fund proposals right from Snapie, with avatars and a clear flag for witnesses that have gone inactive.' },
    ],
  },
  {
    id: '2026-07-20',
    date: '2026-07-20',
    items: [
      { type: 'feature', text: 'New "Prediction Markets" widget on desktop — see trending HivePredict markets right from the sidebar.' },
      { type: 'fix', text: 'Muted accounts no longer throw off the comment count on posts — the number now matches what you actually see.' },
    ],
  },
  {
    id: '2026-07-19',
    date: '2026-07-19',
    items: [
      { type: 'fix', text: 'Fixed profile avatars looking stretched in the sidebar.' },
      { type: 'fix', text: 'Fixed the Hive Keychain approval popup showing up more than it should when voting or commenting.' },
    ],
  },
  {
    id: '2026-07-15',
    date: '2026-07-15',
    title: 'Introducing Snapie Points',
    items: [
      { type: 'feature', text: 'Earn Snapie Points just by using the app — snap, blog, comment, vote, and reblog to build up your score.' },
      { type: 'feature', text: 'New Leaderboard! See who’s earned the most, and check your own spot right from your profile.' },
      { type: 'fix', text: 'Fixed a small hiccup where the reblog button didn’t always show it was already clicked.' },
    ],
  },
  {
    id: '2026-07-14',
    date: '2026-07-14',
    title: 'Reblogs and a cleaner feed',
    items: [
      { type: 'feature', text: 'You can now reblog blog posts, and everything you’ve reblogged shows up on the new Reblogs tab of your profile.' },
      { type: 'improvement', text: '“Latest” is now the default feed tab, so you always land on the freshest posts.' },
      { type: 'fix', text: 'You can clear all your interests to reset “For You” back to trending content.' },
    ],
  },
];

/** id of the newest entry — what "caught up" means. null only if the changelog
 *  is empty. */
export const LATEST_CHANGELOG_ID: string | null = CHANGELOG.length > 0 ? CHANGELOG[0].id : null;

/** Entries newer than the given acknowledged id, newest first. A null/undefined
 *  lastSeen returns the whole list; the caller decides whether that means
 *  "brand-new visitor, show nothing" or "manual full-changelog view". Relies on
 *  ids being YYYY-MM-DD so string comparison is chronological. */
export function getUnseenEntries(lastSeenId: string | null | undefined): ChangelogEntry[] {
  if (!lastSeenId) return CHANGELOG;
  return CHANGELOG.filter(entry => entry.id > lastSeenId);
}
