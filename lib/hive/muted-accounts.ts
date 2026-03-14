/**
 * Muted Accounts Manager
 * Combines community muted accounts with user's personal muted list.
 * Caches the combined result per user in localStorage for 24 hours.
 */

import HiveClient from '@/lib/hive/hiveclient';

const STORAGE_KEY_PREFIX = 'hive_muted_accounts';
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

interface MutedListCache {
  accounts: Set<string>;
  timestamp: number;
}

class MutedAccountsManager {
  private cache: Map<string, MutedListCache> = new Map();
  private loading: Map<string, Promise<Set<string>>> = new Map();

  private getStorageKey(username?: string): string {
    return username
      ? `${STORAGE_KEY_PREFIX}_${username}`
      : `${STORAGE_KEY_PREFIX}_guest`;
  }

  private getCacheKey(username?: string): string {
    return username || '_guest';
  }

  /**
   * Fetch community muted accounts via bridge.list_community_roles
   */
  private async fetchCommunityMutedList(): Promise<string[]> {
    const community = process.env.NEXT_PUBLIC_HIVE_COMMUNITY_TAG;
    if (!community) return [];

    try {
      const result = await HiveClient.call('bridge', 'list_community_roles', {
        community,
        limit: 1000,
      });

      if (result && Array.isArray(result)) {
        return result
          .filter((r: [string, string, string]) => r[1] === 'muted')
          .map((r: [string, string, string]) => r[0]);
      }
      return [];
    } catch (error) {
      console.error('Failed to fetch community muted list:', error);
      return [];
    }
  }

  /**
   * Fetch a user's personal muted list via bridge.get_follow_list
   */
  private async fetchUserMutedList(username: string): Promise<string[]> {
    try {
      const result = await HiveClient.call('bridge', 'get_follow_list', {
        observer: username,
        follow_type: 'muted',
      });

      if (result && Array.isArray(result)) {
        return result.map((entry: { name: string }) => entry.name);
      }
      return [];
    } catch (error) {
      console.error('Failed to fetch user muted list:', error);
      return [];
    }
  }

  private loadFromStorage(username?: string): MutedListCache | null {
    try {
      if (typeof window === 'undefined') return null;

      const stored = localStorage.getItem(this.getStorageKey(username));
      if (!stored) return null;

      const data = JSON.parse(stored);
      const cache: MutedListCache = {
        accounts: new Set(data.accounts),
        timestamp: data.timestamp,
      };

      if (Date.now() - cache.timestamp < CACHE_DURATION) {
        return cache;
      }

      return null;
    } catch (error) {
      console.error('Failed to load muted list from storage:', error);
      return null;
    }
  }

  private saveToStorage(accounts: Set<string>, username?: string): void {
    try {
      if (typeof window === 'undefined') return;

      const data = {
        accounts: Array.from(accounts),
        timestamp: Date.now(),
      };
      localStorage.setItem(this.getStorageKey(username), JSON.stringify(data));
    } catch (error) {
      console.error('Failed to save muted list to storage:', error);
    }
  }

  /**
   * Get the combined muted list (community + user personal).
   * If username is provided, also fetches the user's personal muted list.
   * Results are cached for 24 hours per user.
   */
  async getMutedList(username?: string): Promise<Set<string>> {
    const cacheKey = this.getCacheKey(username);

    // Return in-memory cache if available
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return cached.accounts;
    }

    // If already loading for this user, wait for that promise
    const existing = this.loading.get(cacheKey);
    if (existing) {
      return existing;
    }

    // Try localStorage
    const stored = this.loadFromStorage(username);
    if (stored) {
      this.cache.set(cacheKey, stored);
      return stored.accounts;
    }

    // Fetch from API
    const promise = (async () => {
      const fetches: Promise<string[]>[] = [this.fetchCommunityMutedList()];
      if (username) {
        fetches.push(this.fetchUserMutedList(username));
      }

      const results = await Promise.all(fetches);
      const combined = new Set(results.flat().map(a => a.toLowerCase()));

      this.cache.set(cacheKey, { accounts: combined, timestamp: Date.now() });
      this.saveToStorage(combined, username);
      this.loading.delete(cacheKey);

      return combined;
    })();

    this.loading.set(cacheKey, promise);
    return promise;
  }

  /**
   * Check if an account is muted
   */
  async isMuted(account: string, username?: string): Promise<boolean> {
    const list = await this.getMutedList(username);
    return list.has(account.toLowerCase());
  }

  /**
   * Clear cache for a specific user or all caches
   */
  clearCache(username?: string): void {
    if (username) {
      const cacheKey = this.getCacheKey(username);
      this.cache.delete(cacheKey);
      if (typeof window !== 'undefined') {
        localStorage.removeItem(this.getStorageKey(username));
      }
    } else {
      this.cache.clear();
      if (typeof window !== 'undefined') {
        // Clear all muted account keys
        for (let i = localStorage.length - 1; i >= 0; i--) {
          const key = localStorage.key(i);
          if (key?.startsWith(STORAGE_KEY_PREFIX)) {
            localStorage.removeItem(key);
          }
        }
      }
    }
  }
}

export const mutedAccountsManager = new MutedAccountsManager();
