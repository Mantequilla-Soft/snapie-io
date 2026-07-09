// Combflow (the categorization API "For You" warm-state ranking depends on
// for cross-community category matching) has no documented category
// vocabulary anywhere — this list was built by sampling ~40 diverse recent
// Hive posts (mixed created/trending sort) through the existing
// /api/combflow/post/[author]/[permlink] proxy and observing the real
// `categories` values returned. 18 distinct slugs were seen across 39
// classified posts; a couple of thin/adjacent ones (e.g. philosophy +
// spirituality) were merged into a single picker option so the onboarding
// UI stays a manageable size. This is a real-but-partial sample — Combflow
// almost certainly has categories this sample never hit (art, nature,
// finance, pets, fashion, ...). Extend this list once production usage
// surfaces gaps; nothing in the ranking pipeline assumes it's exhaustive.
export interface InterestTopic {
    /** Shown to the user in the onboarding picker. */
    label: string;
    /** Combflow category slug(s) this option maps to — these are the exact
     *  values stored in UserSettings.interestTags and compared against a
     *  candidate's own `categories` array at ranking time (see
     *  lib/discovery/forYouWarm.ts). A label can map to more than one slug. */
    tags: string[];
}

export const INTEREST_TOPICS: InterestTopic[] = [
    { label: 'Travel', tags: ['travel'] },
    { label: 'Photography', tags: ['photography'] },
    { label: 'Writing & Storytelling', tags: ['writing'] },
    { label: 'Health & Fitness', tags: ['health-fitness'] },
    { label: 'Food & Cooking', tags: ['food'] },
    { label: 'Philosophy & Spirituality', tags: ['philosophy', 'spirituality'] },
    { label: 'Music', tags: ['music'] },
    { label: 'Movies & TV', tags: ['movies-tv'] },
    { label: 'Gaming', tags: ['gaming'] },
    { label: 'Tech & Programming', tags: ['programming'] },
    { label: 'Crypto & Hive', tags: ['crypto', 'hive'] },
    { label: 'Sports', tags: ['team-sports'] },
    { label: 'DIY, Crafts & Homesteading', tags: ['diy-crafts', 'homesteading'] },
    { label: 'Social Issues & Activism', tags: ['social-issues'] },
];
