import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/mongodb';
import { Channel } from '@/lib/db/models/Channel';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  await connectDB();
  const channel = await Channel.findById(params.id);
  if (!channel) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ channel });
}
