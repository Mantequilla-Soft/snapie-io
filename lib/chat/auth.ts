import { Signature } from '@hiveio/dhive';
import type { ExtendedAccount } from '@hiveio/dhive';
import { createHash } from 'crypto';
import jwt from 'jsonwebtoken';
import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/mongodb';
import { ChatUser } from '@/lib/db/models/ChatUser';
import HiveClient from '@/lib/hive/hiveclient';

const JWT_SECRET = process.env.CHAT_JWT_SECRET!;
if (!JWT_SECRET) throw new Error('CHAT_JWT_SECRET is not defined');

function normalizeSignatureInput(raw: string): string {
  return raw.trim();
}

function tryParseWrappedSignature(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed.startsWith('{')) return null;
  try {
    const parsed = JSON.parse(trimmed) as { signature?: string; result?: string };
    if (typeof parsed.signature === 'string' && parsed.signature.length > 0) return parsed.signature;
    if (typeof parsed.result === 'string' && parsed.result.length > 0) return parsed.result;
    return null;
  } catch {
    return null;
  }
}

function parseSignature(rawSignature: string): Signature {
  const normalized = normalizeSignatureInput(rawSignature);
  const wrapped = tryParseWrappedSignature(normalized);
  const candidate = wrapped || normalized;

  if (candidate.startsWith('SIG_K1_') || candidate.startsWith('SIG_R1_')) {
    return Signature.fromString(candidate);
  }

  if (/^[0-9a-fA-F]+$/.test(candidate) && candidate.length % 2 === 0) {
    const buf = Buffer.from(candidate, 'hex');
    if (buf.length === 65) {
      return Signature.fromBuffer(buf);
    }
  }

  return Signature.fromString(candidate);
}

/** True when `key` is one of the account's on-chain posting key_auths. */
function hasPostingKey(account: ExtendedAccount, key: string): boolean {
  return account.posting.key_auths.some(([k]) => String(k) === key);
}

/**
 * True when `recoveredKey` belongs to an account that `account` has delegated
 * sufficient posting authority to via `posting.account_auths`.
 *
 * Only one signature accompanies a challenge, so that single signer must meet
 * the account's posting `weight_threshold` on its own — hence we only consider
 * delegates whose granted weight clears the threshold. We check each delegate's
 * own posting `key_auths`; service accounts (e.g. @threespeak) sign with their
 * own key and Hive caps authority nesting in practice, so we deliberately do
 * not recurse into a delegate's own delegates.
 */
async function verifyDelegatedPostingSignature(
  account: ExtendedAccount,
  recoveredKey: string
): Promise<boolean> {
  const threshold = account.posting.weight_threshold;
  const delegateNames = account.posting.account_auths
    .filter(([, weight]) => weight >= threshold)
    .map(([name]) => String(name));
  if (delegateNames.length === 0) return false;

  const delegates = await HiveClient.database.getAccounts(delegateNames);
  return delegates.some((delegate) => hasPostingKey(delegate, recoveredKey));
}

/**
 * Verify that `challenge` was signed by an authority allowed to act with the
 * posting permission of `username`. Two cases are accepted:
 *
 *  1. **Direct** — the signer is one of the account's own posting `key_auths`.
 *  2. **Delegated** — the signer is the posting key of another account that
 *     `username` granted posting authority to via `posting.account_auths`
 *     (e.g. a signature produced by @threespeak on the user's behalf).
 *
 * Case 2 lets HiveSigner / ManteAuth users — who can't sign a challenge
 * client-side — authenticate: their delegated service account signs the
 * challenge for them, the same trust they already extend for posting ops.
 */
export async function verifyHiveSignature(
  username: string,
  challenge: string,
  signature: string
): Promise<boolean> {
  try {
    const normalizedUser = username.trim().toLowerCase();
    const [account] = await HiveClient.database.getAccounts([normalizedUser]);
    if (!account) return false;

    // Recover the public key that produced the signature.
    const msgHash = createHash('sha256').update(challenge, 'utf8').digest();
    const recovered = parseSignature(signature).recover(msgHash).toString();

    // 1. Direct: signed by one of the account's own posting keys.
    if (hasPostingKey(account, recovered)) return true;

    // 2. Delegated: signed by an account this user granted posting authority to.
    return await verifyDelegatedPostingSignature(account, recovered);
  } catch {
    return false;
  }
}

export function signChatJWT(username: string): string {
  return jwt.sign({ sub: username }, JWT_SECRET, { expiresIn: '7d' });
}

export function verifyChatJWT(token: string): { sub: string } | null {
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { sub: string };
    return payload;
  } catch {
    return null;
  }
}

type RouteHandler = (
  req: NextRequest,
  context: { username: string; params?: Record<string, string> }
) => Promise<NextResponse>;

export function withChatAuth(handler: RouteHandler) {
  return async (req: NextRequest, ctx?: { params?: Record<string, string> }) => {
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const payload = verifyChatJWT(token);
    if (!payload) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });

    await connectDB();
    await ChatUser.findOneAndUpdate(
      { _id: payload.sub },
      { $set: { lastSeen: new Date() } },
      { upsert: true, returnDocument: 'after' }
    );
    return handler(req, { username: payload.sub, params: ctx?.params });
  };
}
