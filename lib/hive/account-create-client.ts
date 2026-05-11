'use client';

import { PrivateKey, type KeyRole } from '@hiveio/dhive';
import HiveClient from './hiveclient';

export interface PrivateKeys {
  owner: string;
  active: string;
  posting: string;
  memo: string;
  ownerPubkey: string;
  activePubkey: string;
  postingPubkey: string;
  memoPubkey: string;
}

export interface ShareableAccountData {
  username: string;
  ownerPubkey: string;
  activePubkey: string;
  postingPubkey: string;
  memoPubkey: string;
}

const ROLES: KeyRole[] = ['owner', 'active', 'posting', 'memo'];

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

export interface AccountNameValidation {
  isValid: boolean;
  error?: string;
}

export function validateAccountName(name: string): AccountNameValidation {
  if (!name) return { isValid: false, error: 'Username is required' };
  if (name.length < 3) return { isValid: false, error: 'Username must be at least 3 characters' };
  if (name.length > 16) return { isValid: false, error: 'Username must be at most 16 characters' };

  const segments = name.split('.');
  for (const segment of segments) {
    if (segment.length === 0) return { isValid: false, error: 'Username cannot contain empty segments' };
    if (segment.length < 3) return { isValid: false, error: 'Each segment must be at least 3 characters' };
    if (!/^[a-z]/.test(segment)) return { isValid: false, error: 'Each segment must start with a letter' };
    if (!/[a-z0-9]$/.test(segment)) return { isValid: false, error: 'Each segment must end with a letter or digit' };
    if (!/^[a-z0-9-]+$/.test(segment)) return { isValid: false, error: 'Only lowercase letters, digits, and hyphens are allowed' };
    if (/--/.test(segment)) return { isValid: false, error: 'No consecutive hyphens allowed' };
  }
  return { isValid: true };
}

export async function checkAccountAvailability(name: string): Promise<boolean> {
  const accounts = await HiveClient.database.getAccounts([name]);
  return accounts.length === 0;
}

const BACKUP_TEMPLATE = (username: string, password: string, keys: PrivateKeys) =>
  `SNAPIE / HIVE ACCOUNT BACKUP
============================
Generated: ${new Date().toISOString()}

Username: ${username}

Master Password (regenerates all keys below):
${password}

Owner key   (recovery only — never paste online):
  Private: ${keys.owner}
  Public:  ${keys.ownerPubkey}

Active key  (wallet, transfers, account management):
  Private: ${keys.active}
  Public:  ${keys.activePubkey}

Posting key (posts, votes, comments — daily use):
  Private: ${keys.posting}
  Public:  ${keys.postingPubkey}

Memo key    (encrypted memos):
  Private: ${keys.memo}
  Public:  ${keys.memoPubkey}

WARNING
=======
- These keys are the ONLY way to access this account. Hive has no password reset.
- Anyone holding the OWNER key can take full control of the account.
- Store this file offline (USB, password manager, printout). Do not email or screenshot it.
`;

export interface DownloadBackupCallbacks {
  onClipboardFallback?: () => void;
  onDownload?: () => void;
}

export function downloadBackupFile(
  username: string,
  password: string,
  keys: PrivateKeys,
  callbacks: DownloadBackupCallbacks = {},
): void {
  const content = BACKUP_TEMPLATE(username, password, keys);
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const isIOSInApp = /iPhone|iPad|iPod/.test(ua) && !/Safari\//.test(ua);

  if (isIOSInApp && navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(content).then(() => callbacks.onClipboardFallback?.());
    return;
  }

  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `hive-${username}-keys.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  callbacks.onDownload?.();
}
