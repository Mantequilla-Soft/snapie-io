export interface Beneficiary {
    account: string;
    weight: number;
}

const POST_CAP_BP    = 1000; // 10%
const COMMENT_CAP_BP = 3000; // 30%
const MAX_SLOTS      = 8;    // Hive hard limit

/**
 * Merge two beneficiary lists, sum duplicate accounts, cap to 8 slots and
 * scale total weight down to the Hive comment_options cap.
 *
 * @param existing - beneficiaries already on the post (e.g. existing user-set ones)
 * @param incoming - new entries to merge in (e.g. from a memeCreated payload)
 * @param isComment - true for snaps/comments (30% cap), false for top-level posts (10% cap)
 */
export function aggregateBeneficiaries(
    existing: Beneficiary[],
    incoming: Beneficiary[],
    isComment: boolean,
): Beneficiary[] {
    const map = new Map<string, number>(existing.map(b => [b.account, b.weight]));
    for (const b of incoming) {
        map.set(b.account, (map.get(b.account) ?? 0) + b.weight);
    }

    // Sort descending, take top 8 slots
    let entries = [...map.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, MAX_SLOTS);

    // Scale proportionally if over cap
    const cap   = isComment ? COMMENT_CAP_BP : POST_CAP_BP;
    const total = entries.reduce((s, [, w]) => s + w, 0);
    if (total > cap) {
        entries = entries.map(([acc, w]) => [acc, Math.floor((w / total) * cap)]);
    }

    return entries
        .filter(([, w]) => w > 0)
        .map(([account, weight]) => ({ account, weight }));
}
