import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/mongodb';
import { Challenge } from '@/lib/db/models/Challenge';
import { verifyHiveSignature, signChatJWT } from '@/lib/chat/auth';

export async function POST(req: NextRequest) {
  try {
    const { username, challenge, signature } = await req.json();
    if (!username || !challenge || !signature) {
      return NextResponse.json({ error: 'username, challenge, and signature required' }, { status: 400 });
    }
    const normalizedUser = String(username).trim().toLowerCase();
    if (!normalizedUser) {
      return NextResponse.json({ error: 'username, challenge, and signature required' }, { status: 400 });
    }

    await connectDB();

    const stored = await Challenge.findOneAndDelete({ nonce: challenge, username: normalizedUser });
    if (!stored) {
      return NextResponse.json({ error: 'Invalid or expired challenge' }, { status: 401 });
    }

    const valid = await verifyHiveSignature(normalizedUser, challenge, signature);
    if (!valid) {
      return NextResponse.json({ error: 'Signature verification failed' }, { status: 401 });
    }

    const token = signChatJWT(normalizedUser);
    return NextResponse.json({ token });
  } catch (err) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
