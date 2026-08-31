import { NextResponse } from 'next/server';
import { withChatAuth } from '@/lib/chat/auth';
import { isAdminUsername } from '@/lib/admin';

// The only sanctioned way for the client to learn its own admin status —
// ADMIN_HIVE_USERNAMES is deliberately server-only (no NEXT_PUBLIC_ prefix)
// so the admin list itself never ships in the bundle. Drives the Sidebar's
// conditional nav item and every admin page's own gate (hooks/useIsAdmin.ts).
export const GET = withChatAuth(async (_req, { username }) => {
  return NextResponse.json({ isAdmin: isAdminUsername(username) });
});
