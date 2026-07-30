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
    id: '2026-07-30',
    date: '2026-07-30',
    items: [
      { type: 'feature', text: 'Your home feed now shows a banner when you have pending rewards to claim — with the exact amount, and a direct link to your wallet. Dismissible, and it only comes back once there\'s something new to claim.' },
      { type: 'improvement', text: 'Pending Rewards now sits right at the top of your wallet, above your account balance — since that\'s usually why you opened it.' },
      { type: 'feature', text: 'Added quick "what is this?" explanations in your wallet for the more confusing stuff — Liquid HIVE, HBD, Convert, Swap, and Delegate.' },
      { type: 'fix', text: 'Fixed chat read receipts (and typing indicators) getting permanently stuck for conversations with usernames containing a dot.' },
    ],
  },
  {
    id: '2026-07-29',
    date: '2026-07-29',
    items: [
      { type: 'improvement', text: 'Chat unread badges are smarter now — public channels only notify you when someone mentions you or replies to you, not on every single message.' },
      { type: 'fix', text: 'Fixed chat sometimes showing an unread badge when there was nothing new to actually read.' },
    ],
  },
  {
    id: '2026-07-28',
    date: '2026-07-28',
    items: [
      { type: 'improvement', text: 'Replying to a Snap no longer reloads your whole feed — your reply shows up instantly and you stay right where you were scrolled to.' },
      { type: 'improvement', text: 'Wallet actions (Send, Power Up, Swap, Savings, and more) now show your available balance and a MAX button, so you don\'t have to close the window to go check.' },
      { type: 'feature', text: 'Requesting a payment via QR code now notifies you the instant it\'s paid — no more manually refreshing your wallet to check.' },
    ],
  },
  {
    id: '2026-07-27',
    date: '2026-07-27',
    items: [
      { type: 'feature', text: 'Equipped Mood Badges now show up next to your avatar practically everywhere on Snapie — not just the home feed, profile, and wallet.' },
    ],
  },
  {
    id: '2026-07-26',
    date: '2026-07-26',
    items: [
      { type: 'feature', text: '6 new Mood Badges: Excited, Sleepy, Salty, Grouchy, Caffeinated, and Amused — 8 total to collect now.' },
      { type: 'improvement', text: 'Bigger avatars in the home feed.' },
      { type: 'improvement', text: 'You\'ll now get notified right away if you receive bonus Snapie Points.' },
    ],
  },
  {
    id: '2026-07-25',
    date: '2026-07-25',
    title: 'Mood Badges',
    items: [
      { type: 'feature', text: 'New Mood Badges — spend Snapie Points on a bull or bear badge that shows next to your avatar everywhere on Snapie. Buy and switch anytime from Settings.' },
    ],
  },
  {
    id: '2026-07-24',
    date: '2026-07-24',
    items: [
      { type: 'fix', text: 'Fixed Snapie Points not being awarded for votes on Snaps and Shorts — voting on a blog post always worked, but the app\'s two most common feeds were silently missing it.' },
      { type: 'fix', text: 'The "what are you into?" interest prompt no longer reappears every time you switch devices or browsers — and now only shows to brand-new accounts, not longtime Hive users just discovering Snapie. Still editable anytime from Settings.' },
    ],
  },
  {
    id: '2026-07-23',
    date: '2026-07-23',
    items: [
      { type: 'fix', text: 'Fixed Shorts showing an empty feed — the video service it was pulling from had moved to a new address.' },
      { type: 'feature', text: 'New "vote the daily Snaps post" nudge in the sidebar — a bigger payout on that post means bigger reward payouts for everyone’s replies, on every Hive frontend.' },
      { type: 'feature', text: 'You can now buy Snapie Points with HBD from Settings — handy if you\'d rather support Snapie directly than grind for points.' },
      { type: 'improvement', text: 'Your Wallet now shows a Snapie Points card, with both your spendable balance and your all-time (leaderboard) total in one place.' },
    ],
  },
  {
    id: '2026-07-22',
    date: '2026-07-22',
    items: [
      { type: 'feature', text: 'New Governance section in Settings — vote for Hive witnesses and Decentralized Hive Fund proposals right from Snapie, with avatars and a clear flag for witnesses that have gone inactive.' },
      { type: 'improvement', text: 'Proposal voting now shows each proposal’s voting power and funding status, clearly marks the funding cutoff, and opens proposal posts right inside Snapie instead of sending you to hive.blog.' },
      { type: 'fix', text: 'Witness and proposal voting now work for everyone, including accounts using Snapie’s built-in login — no external wallet required.' },
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
