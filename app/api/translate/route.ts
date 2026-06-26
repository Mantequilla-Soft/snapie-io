import { NextRequest, NextResponse } from 'next/server';

const LIBRETRANSLATE_URL = process.env.LIBRETRANSLATE_URL ?? '';
const LIBRETRANSLATE_KEY = process.env.LIBRETRANSLATE_KEY ?? '';
const MAX_CHARS = 1500;
const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60_000;

// Simple in-memory rate limiter — resets on cold start, good enough for serverless
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string): boolean {
    const now = Date.now();
    const entry = rateLimitMap.get(ip);
    if (!entry || now > entry.resetAt) {
        rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
        return true;
    }
    if (entry.count >= RATE_LIMIT) return false;
    entry.count++;
    return true;
}

export async function POST(req: NextRequest) {
    if (!LIBRETRANSLATE_URL) {
        return NextResponse.json({ error: 'Translation service not configured.' }, { status: 503 });
    }

    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
    if (!checkRateLimit(ip)) {
        return NextResponse.json({ error: 'Too many requests. Try again in a minute.' }, { status: 429 });
    }

    let body: { text?: string; targetLang?: string };
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
    }

    const { text, targetLang } = body;
    if (!text?.trim() || !targetLang) {
        return NextResponse.json({ error: 'Missing text or targetLang.' }, { status: 400 });
    }

    try {
        const res = await fetch(`${LIBRETRANSLATE_URL}/translate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                q: text.slice(0, MAX_CHARS),
                source: 'auto',
                target: targetLang,
                ...(LIBRETRANSLATE_KEY && { api_key: LIBRETRANSLATE_KEY }),
            }),
            signal: AbortSignal.timeout(10_000),
        });

        if (!res.ok) {
            console.error('LibreTranslate error:', res.status, await res.text());
            return NextResponse.json({ error: 'Translation service returned an error.' }, { status: 502 });
        }

        const data = await res.json();
        return NextResponse.json({ translatedText: data.translatedText });
    } catch (err) {
        console.error('Translation fetch failed:', err);
        return NextResponse.json({ error: 'Translation service unreachable.' }, { status: 503 });
    }
}
