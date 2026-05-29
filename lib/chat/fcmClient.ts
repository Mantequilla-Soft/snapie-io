'use client';

// Firebase Messaging client — gracefully no-ops when NEXT_PUBLIC_FIREBASE_CONFIG is absent.
// Swap in real Firebase init here once the project is configured.

export async function getFCMToken(): Promise<string | null> {
  return null;
}

export function onForegroundMessage(_handler: (payload: unknown) => void): () => void {
  return () => {};
}
