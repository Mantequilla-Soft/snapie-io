import { Signature } from '@hiveio/dhive';
import { createHash } from 'crypto';
import jwt from 'jsonwebtoken';
import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/mongodb';
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

function parseSignature(rawSignature: string): { sig: Signature; format: string } {
  const normalized = normalizeSignatureInput(rawSignature);
  const wrapped = tryParseWrappedSignature(normalized);
  const candidate = wrapped || normalized;

  if (candidate.startsWith('SIG_K1_') || candidate.startsWith('SIG_R1_')) {
    return { sig: Signature.fromString(candidate), format: 'legacy-sig-string' };
  }

  if (/^[0-9a-fA-F]+$/.test(candidate) && candidate.length % 2 === 0) {
    const buf = Buffer.from(candidate, 'hex');
    if (buf.length === 65) {
      return { sig: Signature.fromBuffer(buf), format: 'compact-hex-65b' };
    }
  }

  return { sig: Signature.fromString(candidate), format: 'fallback-fromString' };
}

export async function verifyHiveSignature(
  username: string,
  challenge: string,
  signature: string
): Promise<boolean> {
  try {
    const normalizedUser = username.trim().toLowerCase();
    const [account] = await HiveClient.database.getAccounts([normalizedUser]);
    if (!account) return false;

    const postingKeys: string[] = account.posting.key_auths.map(([key]: [string, number]) => key);
    if (postingKeys.length === 0) return false;

    // Recover public key from signature and compare to on-chain posting key
    const msgHash = createHash('sha256').update(challenge, 'utf8').digest();
    const { sig, format } = parseSignature(signature);
    const recovered = sig.recover(msgHash);
    void format;
    return postingKeys.includes(recovered.toString());
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
    return handler(req, { username: payload.sub, params: ctx?.params });
  };
}
