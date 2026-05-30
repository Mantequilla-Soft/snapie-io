import { NextResponse } from 'next/server';

const rateLimitMap = new Map<string, number[]>();

export function isRateLimited(username: string): boolean {
  const now = Date.now();
  const windowMs = 10_000;
  const maxMessages = 5;
  const timestamps = (rateLimitMap.get(username) || []).filter(t => now - t < windowMs);
  if (timestamps.length >= maxMessages) return true;
  timestamps.push(now);
  rateLimitMap.set(username, timestamps);
  return false;
}

export function validateMessageBody(content: unknown): { ok: true; value: string } | { ok: false; response: NextResponse } {
  if (!content || typeof content !== 'string') {
    return { ok: false, response: NextResponse.json({ error: 'content required' }, { status: 400 }) };
  }
  const trimmed = content.trim();
  if (trimmed.length === 0) {
    return { ok: false, response: NextResponse.json({ error: 'content required' }, { status: 400 }) };
  }
  if (trimmed.length > 2000) {
    return { ok: false, response: NextResponse.json({ error: 'Message too long' }, { status: 400 }) };
  }
  return { ok: true, value: trimmed };
}

