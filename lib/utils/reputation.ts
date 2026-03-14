/**
 * Reputation and content filtering utilities
 * Combines reputation checks (negative rep = spammer) with community muted lists
 */

import { mutedAccountsManager } from '@/lib/hive/muted-accounts';

const REPUTATION_API = 'https://api.hive.blog/reputation-api/accounts';

// Cache to avoid repeated API calls for the same user
const repCache = new Map<string, { rep: number; timestamp: number }>();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

/**
 * Get user reputation from Syncad API
 * Returns the raw reputation score (can be negative)
 */
export async function getUserReputation(username: string): Promise<number> {
  try {
    // Check cache first
    const cached = repCache.get(username);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      return cached.rep;
    }

    const response = await fetch(`${REPUTATION_API}/${username}/reputation`);
    
    if (!response.ok) {
      return 25; // Default to neutral reputation on error
    }

    const reputation = await response.json();
    
    // Cache the result
    repCache.set(username, {
      rep: reputation,
      timestamp: Date.now()
    });

    return reputation;
  } catch (error) {
    return 25; // Default to neutral on error (fail-open)
  }
}

/**
 * Check if a user should be filtered out based on reputation
 * Returns true if the account should be hidden (negative rep)
 */
export async function isLowReputation(username: string): Promise<boolean> {
  const rep = await getUserReputation(username);
  return rep < 0;
}

/**
 * Batch fetch reputations for multiple users in parallel
 * Returns a Map of username -> reputation
 */
async function batchGetReputations(usernames: string[]): Promise<Map<string, number>> {
  const uniqueUsernames = [...new Set(usernames)];
  const results = new Map<string, number>();
  
  // Fetch all reputations in parallel
  const promises = uniqueUsernames.map(async (username) => {
    const rep = await getUserReputation(username);
    return { username, rep };
  });
  
  const resolved = await Promise.all(promises);
  resolved.forEach(({ username, rep }) => {
    results.set(username, rep);
  });
  
  return results;
}

/**
 * Collect all unique authors from content and nested replies
 */
function collectAllAuthors<T extends { author: string; replies?: T[] }>(
  content: T[]
): string[] {
  const authors: string[] = [];
  
  function collect(items: T[]) {
    for (const item of items) {
      authors.push(item.author);
      if (item.replies && item.replies.length > 0) {
        collect(item.replies);
      }
    }
  }
  
  collect(content);
  return authors;
}

/**
 * Filter content by reputation and community muted list
 * Removes items from:
 * 1. Authors with negative reputation (spammers/bots)
 * 2. Community muted accounts
 * Also filters nested replies recursively if they exist
 * 
 * OPTIMIZED: Pre-fetches all reputations in parallel before filtering
 */
export async function filterByReputation<T extends { author: string; replies?: T[] }>(
  content: T[]
): Promise<T[]> {
  if (content.length === 0) return [];
  
  // Pre-fetch all reputations in parallel (huge performance win!)
  const allAuthors = collectAllAuthors(content);
  const [reputations, mutedList] = await Promise.all([
    batchGetReputations(allAuthors),
    mutedAccountsManager.getMutedList()
  ]);
  
  // Now filter synchronously using pre-fetched data
  function filterItems(items: T[]): T[] {
    const filtered: T[] = [];
    
    for (const item of items) {
      const reputation = reputations.get(item.author) ?? 25;
      const isSpammer = reputation < 0;
      const isMuted = mutedList.has(item.author);
      
      if (!isSpammer && !isMuted) {
        // Filter nested replies using the same pre-fetched data
        if (item.replies && item.replies.length > 0) {
          item.replies = filterItems(item.replies);
        }
        filtered.push(item);
      }
    }
    
    return filtered;
  }
  
  return filterItems(content);
}

/**
 * Clear the reputation cache (useful for testing)
 */
export function clearReputationCache(): void {
  repCache.clear();
}
