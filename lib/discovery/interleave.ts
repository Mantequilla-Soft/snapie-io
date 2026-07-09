/**
 * Splices discovery candidates into a base feed every `everyN` items.
 * Dedupes by `permlink` against both the base feed and previously-spliced
 * candidates, and never cycles back through candidates once exhausted — a
 * repeated item reappearing lower in the same scroll session is confusing,
 * not helpful. Always returns a new array; never mutates `base`.
 */
export function interleaveCandidates<T extends { permlink: string }>(
    base: T[],
    candidates: T[],
    everyN: number,
): T[] {
    if (!candidates.length || everyN < 1) return base;

    const basePermlinks = new Set(base.map(item => item.permlink));
    const usedCandidatePermlinks = new Set<string>();
    let candidateIndex = 0;

    function nextCandidate(): T | null {
        while (candidateIndex < candidates.length) {
            const candidate = candidates[candidateIndex++];
            if (!basePermlinks.has(candidate.permlink) && !usedCandidatePermlinks.has(candidate.permlink)) {
                usedCandidatePermlinks.add(candidate.permlink);
                return candidate;
            }
        }
        return null;
    }

    const result: T[] = [];
    for (let i = 0; i < base.length; i++) {
        result.push(base[i]);
        if ((i + 1) % everyN === 0) {
            const candidate = nextCandidate();
            if (candidate) result.push(candidate);
        }
    }
    return result;
}
