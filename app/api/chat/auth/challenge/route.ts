import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { connectDB } from '@/lib/db/mongodb';
import { Challenge } from '@/lib/db/models/Challenge';

export async function POST(req: NextRequest) {
  try {
    const { username } = await req.json();
    if (!username || typeof username !== 'string') {
      return NextResponse.json({ error: 'username required' }, { status: 400 });
    }
    const normalizedUser = username.trim().toLowerCase();
    if (!normalizedUser) {
      return NextResponse.json({ error: 'username required' }, { status: 400 });
    }

    await connectDB();
    const nonce = randomUUID();
    await Challenge.create({ nonce, username: normalizedUser });

    return NextResponse.json({ challenge: nonce });
  } catch (err) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
