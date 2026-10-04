import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/mongodb';
import { ChatUser } from '@/lib/db/models/ChatUser';
import { signChatJWT } from '@/lib/chat/auth';
import { chatIdForClaims, getButrauthVerifier, isWarmupChatId, WARMUP_PREFIX } from '@/lib/chat/butrauth';
import { mergeWarmupIdentity } from '@/lib/chat/graduation';

// Per address, in memory, like the other chat limiters. Verification is cheap
// (cached JWKS), but every success writes a user row.
const hits = new Map<string, number[]>();
function limited(key: string): boolean {
  const now = Date.now();
  const recent = (hits.get(key) || []).filter((t) => now - t < 60_000);
  if (recent.length >= 30) return true;
  recent.push(now);
  hits.set(key, recent);
  return false;
}

/**
 * POST /api/chat/auth/butrauth  { accessToken }
 *
 * Sign in to chat with a ButrAuth access token instead of a Hive signature, so
 * warm-up users (no Hive account, nothing to sign with) can chat. Optional:
 * 404 unless this deployment configured it (see lib/chat/butrauth.ts).
 *
 * Meant to be called by the app's SERVER, which holds the user's token, never
 * by a browser that would have to be given one.
 */
export async function POST(req: NextRequest) {
  try {
    const verifier = await getButrauthVerifier();
    if (!verifier) return NextResponse.json({ error: 'not_enabled' }, { status: 404 });

    const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';
    if (limited(ip)) return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });

    const body = await req.json().catch(() => ({}));
    const accessToken = typeof body?.accessToken === 'string' ? body.accessToken : '';
    if (!accessToken || accessToken.length > 8192) {
      return NextResponse.json({ error: 'accessToken required' }, { status: 400 });
    }

    let claims;
    try {
      claims = await verifier.verifyAccessToken(accessToken);
    } catch {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const chatId = chatIdForClaims(claims);
    if (!chatId) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });

    await connectDB();
    const userId = String(claims.userId).toLowerCase();
    const warmupId = `${WARMUP_PREFIX}${userId}`;

    if (isWarmupChatId(chatId)) {
      // A warm-up token that outlived its graduation (they live an hour): its
      // inbox has moved, so send the app back for a fresh token rather than
      // opening an empty one.
      const existing = await ChatUser.findById(chatId, { mergedInto: 1 }).lean<{ mergedInto?: string | null }>();
      if (existing?.mergedInto) {
        return NextResponse.json({ error: 'graduated', username: existing.mergedInto }, { status: 409 });
      }
    } else {
      // First sign-in with the Hive name this person graduated to: bring the
      // warm-up conversations along. A no-op for everybody else.
      await mergeWarmupIdentity(warmupId, chatId);
    }

    const displayName = isWarmupChatId(chatId) ? (claims.handle || null) : null;
    await ChatUser.updateOne(
      { _id: chatId },
      {
        $setOnInsert: { _id: chatId },
        $set: { butrauthUserId: userId, lastSeen: new Date(), ...(isWarmupChatId(chatId) ? { displayName } : {}) },
      },
      { upsert: true }
    );

    return NextResponse.json({
      token: signChatJWT(chatId),
      username: chatId,
      displayName,
      warmup: isWarmupChatId(chatId),
    });
  } catch (err) {
    console.error('[chat/auth/butrauth]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
