/**
 * Drop items whose `author` is in a muted-accounts set.
 * `exceptAuthor` keeps that one account visible (profile feeds: viewing a
 * muted user explicitly should still show their own posts; other authors
 * on that page — reblogs etc. — stay filtered).
 */
export function filterMutedAuthors<T extends { author: string }>(
  items: readonly T[],
  mutedSet: Set<string>,
  options?: { exceptAuthor?: string },
): T[] {
  if (mutedSet.size === 0 && !options?.exceptAuthor) return items as T[];
  const except = options?.exceptAuthor?.toLowerCase();
  return items.filter((item) => {
    const name = item.author.toLowerCase();
    if (except && name === except) return true;
    return !mutedSet.has(name);
  });
}

export function isMutedAuthor(author: string, mutedSet: Set<string>): boolean {
  return mutedSet.has(author.toLowerCase());
}
