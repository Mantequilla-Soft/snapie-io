'use client';

import { PrivateKey, type KeyRole } from '@hiveio/dhive';
import type { PrivateKeys } from './account-create-client';

const ROLES: KeyRole[] = ['owner', 'active', 'posting', 'memo'];

/** Key derivation pulls dhive. It lives in this module so the home page,
 *  which only validates usernames, does not download it. */
export function generatePassword(): string {
  const array = new Uint32Array(10);
  crypto.getRandomValues(array);
  const wif = PrivateKey.fromSeed(array.toString()).toString();
  return wif.substring(0, 25);
}

export function generateKeys(username: string, password: string): PrivateKeys {
  const out: Record<string, string> = {};
  for (const role of ROLES) {
    const priv = PrivateKey.fromLogin(username, password, role);
    out[role] = priv.toString();
    out[`${role}Pubkey`] = priv.createPublic().toString();
  }
  return out as unknown as PrivateKeys;
}
