export interface HiveTransferQRData {
  to: string;
  amount: string;   // e.g. "1.234 HIVE" or "0.500 HBD"
  memo: string;
}

/**
 * Encodes a Hive transfer into the standard hive://sign/op/<base64url> URI.
 * Compatible with Hive Keychain, HiveAuth, and any wallet that follows the spec.
 */
export function encodeHiveTransferQR(to: string, amount: string, memo: string): string {
  const op = JSON.stringify(['transfer', { to, amount, memo }]);
  const b64 = btoa(op).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `hive://sign/op/${b64}`;
}

/**
 * Decodes a hive://sign/op/<base64url> URI back into transfer fields.
 * Returns null if the string is not a valid Hive transfer QR.
 */
export function decodeHiveTransferQR(raw: string): HiveTransferQRData | null {
  try {
    const PREFIX = 'hive://sign/op/';
    if (!raw.startsWith(PREFIX)) return null;

    const b64url = raw.slice(PREFIX.length);
    const pad = '=='.slice(0, (4 - (b64url.length % 4)) % 4);
    const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/') + pad;
    const op = JSON.parse(atob(b64));

    if (!Array.isArray(op) || op[0] !== 'transfer') return null;
    const { to, amount, memo } = op[1] as Record<string, string>;
    if (!to || !amount) return null;

    return { to, amount, memo: memo ?? '' };
  } catch {
    return null;
  }
}

/** Parse currency from an amount string like "1.234 HIVE" → "HIVE" */
export function currencyFromAmount(amount: string): 'HIVE' | 'HBD' {
  return amount.toUpperCase().includes('HBD') ? 'HBD' : 'HIVE';
}

/** Parse numeric value from an amount string like "1.234 HIVE" → 1.234 */
export function valueFromAmount(amount: string): number {
  return parseFloat(amount) || 0;
}
