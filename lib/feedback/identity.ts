import { verifyChatJWT } from '@/lib/chat/auth';

const HIVE_USERNAME = /^[a-z][a-z0-9-]{2,15}$/;
const SNAPIE_COOKIE_NAMES = ['snapieauth_session', 'snapieauth_csrf'];

export function isHiveUsername(value: string): boolean {
  return HIVE_USERNAME.test(value);
}

function hiveUsernameFromChatJwt(authorization: string | null): string | null {
  if (!authorization?.startsWith('Bearer ')) return null;
  const token = authorization.slice('Bearer '.length).trim();
  if (!token) return null;
  const payload = verifyChatJWT(token);
  if (!payload?.sub) return null;
  const name = payload.sub.trim().toLowerCase();
  return isHiveUsername(name) ? name : null;
}

function snapieCookies(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  const filtered = cookieHeader
    .split(';')
    .map((part) => part.trim())
    .filter((part) => SNAPIE_COOKIE_NAMES.some((name) => part.startsWith(`${name}=`)))
    .join('; ');
  return filtered.includes('snapieauth_session=') ? filtered : null;
}

/**
 * Hive username from a verified session, or null for a guest.
 * Chat JWTs win over the Snapie Auth cookie. Email is never read out.
 */
export async function resolveFeedbackHiveUsername(headers: Headers): Promise<string | null> {
  const fromJwt = hiveUsernameFromChatJwt(headers.get('authorization'));
  if (fromJwt) return fromJwt;

  const base = process.env.SNAPIE_AUTH_URL?.replace(/\/$/, '');
  const cookies = snapieCookies(headers.get('cookie'));
  if (!base || !cookies) return null;

  try {
    const res = await fetch(`${base}/api/auth/me`, {
      headers: { Accept: 'application/json', Cookie: cookies },
      signal: AbortSignal.timeout(4_000),
      redirect: 'error',
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { user?: { hiveUsername?: unknown } };
    const name = typeof data.user?.hiveUsername === 'string' ? data.user.hiveUsername.trim().toLowerCase() : '';
    return isHiveUsername(name) ? name : null;
  } catch {
    return null;
  }
}
