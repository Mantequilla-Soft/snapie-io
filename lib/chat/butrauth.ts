/**
 * Optional ButrAuth sign-in for chat.
 *
 * Hive signature auth (lib/chat/auth.ts) covers everybody with a Hive account.
 * It cannot cover ButrAuth's warm-up users, who have an identity but no account
 * yet, so nothing they could sign. An app that signs its users in through
 * ButrAuth can instead hand us the user's access token, and we accept it when
 * the token was issued to an app on our allowlist.
 *
 * Entirely optional: `@mantequilla-soft/butrauth-client` is an optional
 * dependency, loaded at runtime only when BUTRAUTH_URL and
 * BUTRAUTH_CHAT_AUDIENCES are both set. Without either, or without the package,
 * the route answers 404 and nothing else changes.
 *
 * Identity. A token with a Hive name signs in AS that name, exactly what a
 * Hive signature would give. A warm-up token signs in as `~<butrauth userId>`:
 *   - `~` can never appear in a Hive name, so the two namespaces cannot collide
 *     and no Hive user can ever be handed a warm-up user's messages.
 *   - The userId, not the handle: a handle can change during the warm-up, and
 *     an erased user's handle is released. Keyed by handle, a stranger who later
 *     claims the name would inherit the previous owner's DMs.
 * The handle travels as `displayName`, for clients to show instead of the id.
 */

export type ButrAuthClaims = {
  userId: string;
  hiveUsername: string | null;
  incubation: boolean;
  handle: string | null;
  clientId: string;
};

type Verifier = { verifyAccessToken(token: string): Promise<ButrAuthClaims> };

/** Prefix that marks a chat id as a warm-up identity rather than a Hive name. */
export const WARMUP_PREFIX = '~';

// ButrAuth user ids are Mongo ObjectIds. Checked rather than trusted so a
// malformed claim can never produce an id with `:` (DM ids are split on it).
const USER_ID_RE = /^[a-f0-9]{24}$/;
const HIVE_NAME_RE = /^[a-z][a-z0-9.-]{2,15}$/;

export function isWarmupChatId(id: string): boolean {
  return typeof id === 'string' && id.startsWith(WARMUP_PREFIX);
}

/** The chat id a set of verified ButrAuth claims signs in as, or null. */
export function chatIdForClaims(claims: ButrAuthClaims): string | null {
  const hive = typeof claims.hiveUsername === 'string' ? claims.hiveUsername.trim().toLowerCase() : '';
  if (hive) return HIVE_NAME_RE.test(hive) ? hive : null;
  const uid = String(claims.userId || '').toLowerCase();
  return USER_ID_RE.test(uid) ? `${WARMUP_PREFIX}${uid}` : null;
}

export function butrauthConfig(): { baseUrl: string; audiences: string[]; issuer: string } | null {
  const baseUrl = (process.env.BUTRAUTH_URL || '').trim();
  const audiences = (process.env.BUTRAUTH_CHAT_AUDIENCES || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (!baseUrl || audiences.length === 0) return null;
  return { baseUrl, audiences, issuer: (process.env.BUTRAUTH_ISSUER || 'butrauth').trim() };
}

// Hidden from webpack on purpose. A literal import() of a package that may not
// be installed fails the BUILD; this one is resolved by Node at runtime, where
// a missing package is an ordinary rejected promise we can turn into "off".
const runtimeImport = new Function('m', 'return import(m)') as (m: string) => Promise<any>;

let verifierPromise: Promise<Verifier | null> | null = null;

/** The configured verifier, or null when ButrAuth chat sign-in is off. */
export function getButrauthVerifier(): Promise<Verifier | null> {
  if (!verifierPromise) {
    verifierPromise = (async () => {
      const cfg = butrauthConfig();
      if (!cfg) return null;
      try {
        const mod = await runtimeImport('@mantequilla-soft/butrauth-client');
        if (typeof mod?.ButrAuthTokenVerifier !== 'function') {
          console.warn('[chat] butrauth-client is too old (needs >= 0.6.0); ButrAuth sign-in is off');
          return null;
        }
        return new mod.ButrAuthTokenVerifier(cfg) as Verifier;
      } catch (err) {
        console.warn('[chat] butrauth-client not installed; ButrAuth sign-in is off:', (err as Error).message);
        return null;
      }
    })();
  }
  return verifierPromise;
}

/** Test seam: forget the cached verifier so env changes take effect. */
export function resetButrauthVerifierForTests(override?: Verifier | null): void {
  verifierPromise = override === undefined ? null : Promise.resolve(override);
}
