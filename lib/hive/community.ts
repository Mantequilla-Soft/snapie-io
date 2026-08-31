// Centralized read of Snapie's Hive community tag for new code. Two other
// call sites (lib/hive/client-functions.ts, lib/hive/muted-accounts.ts)
// independently read the same env var — left as-is, migrating them is an
// unrelated cleanup outside this feature's scope.
export const SNAPIE_COMMUNITY_TAG = process.env.NEXT_PUBLIC_HIVE_COMMUNITY_TAG ?? '';
