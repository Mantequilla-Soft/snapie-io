import { Signature } from '@hiveio/dhive';
import { createHash } from 'crypto';
import jwt from 'jsonwebtoken';
import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/mongodb';
import HiveClient from '@/lib/hive/hiveclient';

const JWT_SECRET = process.env.CHAT_JWT_SECRET!;
if (!JWT_SECRET) throw new Error('CHAT_JWT_SECRET is not defined');

export async function verifyHiveSignature(
  username: string,
  challenge: string,
  signature: string
): Promise<boolean> {
  try {
    const [account] = await (HiveClient as any).client.database.getAccounts([username]);
    if (!account) return false;

    const postingKeys: string[] = account.posting.key_auths.map(([key]: [string, number]) => key);
    if (postingKeys.length === 0) return false;

    // Recover public key from signature and compare to on-chain posting key
    const msgHash = createHash('sha256').update(challenge, 'utf8').digest();
    const sig = Signature.fromString(signature);
    const recovered = sig.recover(msgHash);
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
