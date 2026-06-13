import type { StorageAdapter } from './types';

/** Default adapter — uses localStorage when available, falls back to in-memory. */
export function createDefaultStorage(): StorageAdapter {
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage;
  }
  const mem: Record<string, string> = {};
  return {
    getItem: (k) => mem[k] ?? null,
    setItem: (k, v) => { mem[k] = v; },
    removeItem: (k) => { delete mem[k]; },
  };
}
