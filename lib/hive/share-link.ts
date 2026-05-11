import type { ShareableAccountData } from './account-create-client';

export type { ShareableAccountData };

function base64UrlEncode(str: string): string {
  if (typeof window === 'undefined') {
    return Buffer.from(str, 'utf8').toString('base64url');
  }
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(str: string): string {
  if (typeof window === 'undefined') {
    return Buffer.from(str, 'base64url').toString('utf8');
  }
  let s = str.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bin = atob(s);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

export function encodeAccountData(data: ShareableAccountData): string {
  const compact = {
    u: data.username,
    o: data.ownerPubkey,
    a: data.activePubkey,
    p: data.postingPubkey,
    m: data.memoPubkey,
  };
  return base64UrlEncode(JSON.stringify(compact));
}

export function decodeAccountData(encoded: string): ShareableAccountData | null {
  if (!encoded || typeof encoded !== 'string') return null;
  try {
    const json = base64UrlDecode(encoded);
    const obj = JSON.parse(json) as Record<string, unknown>;
    const { u, o, a, p, m } = obj;
    if (
      typeof u !== 'string' || !u ||
      typeof o !== 'string' || !o ||
      typeof a !== 'string' || !a ||
      typeof p !== 'string' || !p ||
      typeof m !== 'string' || !m
    ) {
      return null;
    }
    return { username: u, ownerPubkey: o, activePubkey: a, postingPubkey: p, memoPubkey: m };
  } catch {
    return null;
  }
}

export function generateShareableLink(data: ShareableAccountData, origin?: string): string {
  const base = origin ?? (typeof window !== 'undefined' ? window.location.origin : '');
  return `${base}/join?code=${encodeAccountData(data)}`;
}
