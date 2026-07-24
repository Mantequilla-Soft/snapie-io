import { NextRequest, NextResponse } from 'next/server';
import { withChatAuth } from '@/lib/chat/auth';
import { getInterestsState, saveInterests } from '@/lib/discovery/interestsService';

// Public read — like a points balance, "has this account done onboarding" and
// "is it a new account" aren't sensitive, and gating the GET behind auth would
// force a signature prompt just to decide whether to show a modal.
export async function GET(req: NextRequest) {
  const usernameParam = new URL(req.url).searchParams.get('username');
  if (!usernameParam) {
    return NextResponse.json({ error: 'username_required' }, { status: 400 });
  }
  const state = await getInterestsState(usernameParam.toLowerCase());
  return NextResponse.json(state);
}

export const POST = withChatAuth(async (req, { username }) => {
  let body: { interestTags?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }

  const { interestTags } = body;
  if (!Array.isArray(interestTags) || !interestTags.every(t => typeof t === 'string')) {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }

  await saveInterests(username, interestTags);
  return NextResponse.json({ ok: true });
});
