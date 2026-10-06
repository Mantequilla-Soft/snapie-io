import type {
  AccountJob,
  BroadcastResult,
  EligibilityResponse,
  HiveIntentResponse,
  LightningIntentResponse,
  NeedsClientSigningResponse,
  PaymentFeeResponse,
  PaymentIntentStatus,
  PublicConfig,
  QuotaResponse,
  SignMessageResult,
  SnapieMeUser,
  SnapieUser,
} from './types'
import { SnapieAuthError as AuthError } from './types'

// All calls route through our Next.js proxy — never directly to auth.snapie.io.
const BASE = '/api/snapie-auth'

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {}
  if (body !== undefined) headers['Content-Type'] = 'application/json'

  const res = await fetch(`${BASE}${path}`, {
    method,
    credentials: 'include',
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

  if (res.status === 204) return {} as T

  const data = await res.json().catch(() => ({}))

  if (!res.ok) {
    throw new AuthError(data.error ?? 'unknown_error', res.status, data.error)
  }

  return data as T
}

// ── Public (no session required) ─────────────────────────────────────────────

export function getQuota() {
  return req<QuotaResponse>('GET', '/quota')
}

export function getPublicConfig() {
  return req<PublicConfig>('GET', '/public-config')
}

// ── Auth ─────────────────────────────────────────────────────────────────────

// Login endpoints return { user: SnapieUser } directly — no extra getMe() needed.
export async function loginWithGoogle(credential: string): Promise<SnapieUser> {
  const data = await req<{ user: SnapieUser }>('POST', '/auth/google', { credential })
  return data.user
}

/** Returns { pending: true } — user must verify email before logging in. */
export function registerWithEmail(email: string, password: string) {
  return req<{ pending: true }>('POST', '/auth/email/register', { email, password })
}

export async function loginWithEmail(email: string, password: string): Promise<SnapieUser> {
  // 403 means email not yet verified — throw a specific code so the UI can handle it.
  const res = await fetch(`${BASE}/auth/email/login`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  if (res.status === 403) throw new AuthError('email_not_verified', 403)
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new AuthError(data.error ?? 'unknown_error', res.status)
  return (data as { user: SnapieUser }).user
}

/**
 * Codes meaning "this email already has an account" — the register call failed
 * because the user is a returning visitor, not because anything is wrong.
 *
 * Verified against menobass/snapie-auth src/routes/auth.js, which returns
 *   409 email_already_registered  — verified account with a Hive username
 *   409 login_to_claim_hive       — verified account still missing a username
 * Both mean "sign in instead". The status check covers them, and the remaining
 * entries are defensive in case the auth service adopts Supabase-style codes.
 */
const ACCOUNT_EXISTS_CODES = new Set([
  'email_already_registered',
  'login_to_claim_hive',
  'email_exists',
  'user_already_exists',
  'email_in_use',
])

/**
 * Codes meaning the password itself is unacceptable, so no retry of the same
 * password can succeed. `password_too_short` is what the auth server returns
 * (routes/auth.js); `weak_password` is the Supabase equivalent.
 */
const PASSWORD_PROBLEM_CODES = new Set([
  'password_too_short',
  'weak_password',
])

/**
 * Codes meaning "no account with this email" — an unambiguous signal from the
 * login call that we should fall through to registration.
 *
 * The current auth server does NOT emit any of these: it answers
 * `invalid_credentials` (401) for both a wrong password and an unknown email.
 * Kept as a fast path so that if the service ever does distinguish them, we
 * skip the extra register probe.
 */
const NO_ACCOUNT_CODES = new Set([
  'user_not_found',
  'email_not_found',
  'no_user_found',
  'account_not_found',
])

function isAccountExists(e: unknown): boolean {
  const err = e as AuthError
  return ACCOUNT_EXISTS_CODES.has(err?.code) || err?.status === 409
}

function isNoAccount(e: unknown): boolean {
  return NO_ACCOUNT_CODES.has((e as AuthError)?.code)
}

/**
 * Re-throw an error with `accountExists` set, preserving its original code and
 * status so the UI keeps the right message. A non-AuthError is wrapped so the
 * flag is always readable.
 */
function markAccountExists(e: unknown): AuthError {
  const err = e as AuthError
  if (err instanceof AuthError) {
    return new AuthError(err.code, err.status, err.message, true)
  }
  return new AuthError('unauthorized', 401, undefined, true)
}

/** Which way the auto-detect flow had to correct the user's chosen tab. */
export type EmailAuthNotice = 'alreadyRegistered' | 'accountCreated'

export type EmailAuthResult =
  | { outcome: 'registered'; notice?: EmailAuthNotice }
  | { outcome: 'signedIn'; user: SnapieUser; notice?: EmailAuthNotice }

/**
 * Single entry point for the email form. The chosen tab is treated as a *hint*
 * only — the correct action is discovered from the server's response, so a
 * returning user who never noticed the tab still signs in, and a new user who
 * landed on the Sign In tab still registers.
 *
 * Contract verified against menobass/snapie-auth src/routes/auth.js:
 *
 *   POST /auth/email/register
 *     202 {pending}          new account created, OR existing-but-unverified
 *                            (server resends the mail rather than confirming
 *                            the account exists — both mean "verify your email")
 *     409 email_already_registered   account exists, verified, has a username
 *     409 login_to_claim_hive        account exists, verified, no username yet
 *
 *   POST /auth/email/login
 *     200 {user}
 *     401 invalid_credentials  wrong password OR unknown email — indistinguishable
 *     403 email_not_verified   password was correct, email still unverified
 *
 * Because 401 is ambiguous, the Sign In path resolves it with a register probe:
 * 409 means the account was there all along (so the password was simply wrong),
 * and 202 means the email was genuinely unused (or unverified), so registering is
 * the right move. `email_not_verified` is never a fallback trigger.
 */
export type EmailAuthOps = {
  register: (email: string, password: string) => Promise<unknown>
  login: (email: string, password: string) => Promise<SnapieUser>
}

export async function authenticateWithEmail(
  email: string,
  password: string,
  mode: 'login' | 'register',
  ops: EmailAuthOps = { register: registerWithEmail, login: loginWithEmail },
): Promise<EmailAuthResult> {
  const { register, login } = ops
  if (mode === 'register') {
    try {
      await register(email, password)
      return { outcome: 'registered' }
    } catch (regErr) {
      if (!isAccountExists(regErr)) throw regErr
      // The account is already here — this was a login all along.
      try {
        const user = await login(email, password)
        return { outcome: 'signedIn', user, notice: 'alreadyRegistered' }
      } catch (logErr) {
        // The fallback failed, but we still know the account exists, so the
        // failure means "sign in with the right password" — not "register".
        // Marking it lets the modal move to the Sign In tab instead of leaving
        // the user on a tab that will fail the same way forever.
        throw markAccountExists(logErr)
      }
    }
  }

  try {
    const user = await login(email, password)
    return { outcome: 'signedIn', user }
  } catch (logErr) {
    // NOTE: the auth server returns `invalid_credentials` for BOTH a wrong
    // password and an unknown email (routes/auth.js), so there is no
    // "no such account" code to key off — the register probe below is what
    // actually disambiguates. isNoAccount is kept as a fast path for any future
    // server that does distinguish the two.
    if (isNoAccount(logErr)) {
      await register(email, password)
      return { outcome: 'registered', notice: 'accountCreated' }
    }

    const ambiguous = (logErr as AuthError)?.code === 'unauthorized' ||
      (logErr as AuthError)?.code === 'invalid_credentials'
    if (!ambiguous) throw logErr

    // Ambiguous credential failure. Probe with a register call to tell a wrong
    // password apart from an unused email:
    //   - 409 => already registered, so the password was simply wrong.
    //   - 202 => accepted. This covers a brand-new account AND an existing
    //     account that has not verified its email yet — the server resends the
    //     verification mail rather than disclosing that the account exists, so
    //     the two are deliberately indistinguishable. Both land on the same
    //     verification screen, so no notice is claimed here.
    try {
      await register(email, password)
    } catch (probeErr) {
      if (isAccountExists(probeErr)) {
        throw new AuthError('unauthorized', 401, undefined, true)
      }
      // The probe proved nothing about the credentials, but it did prove the
      // password is unusable (too short). Surface that instead of the generic
      // invalid-credentials message, which would send the user off to retype a
      // password the server will never accept.
      if (PASSWORD_PROBLEM_CODES.has((probeErr as AuthError)?.code)) throw probeErr
      // Anything else (rate limits, network) tells us nothing about the
      // account, so report the original login failure.
      throw logErr
    }
    return { outcome: 'registered' }
  }
}

export function resendVerification() {
  return req<{ ok: true }>('POST', '/auth/email/resend')
}

// GET /auth/me returns { user: SnapieMeUser } when a session cookie is
// present — a superset of SnapieUser with email, accountValueUsd, and
// emancipationRequired. With no session cookie the proxy answers 200
// { authenticated: false } instead of the auth server's 401, so a logged-out
// visit is not a failed request. Null means logged out.
export async function getMe(): Promise<SnapieMeUser | null> {
  const data = await req<{ user?: SnapieMeUser | null }>('GET', '/auth/me')
  return data.user ?? null
}

export function logout() {
  return req<{ ok: true }>('POST', '/auth/logout')
}

// ── Account ───────────────────────────────────────────────────────────────────

export function getEligibility() {
  return req<EligibilityResponse>('GET', '/account/eligibility')
}

export function checkUsername(username: string) {
  return req<{ available: boolean; reason?: string }>(
    'GET',
    `/account/check-username/${encodeURIComponent(username)}`,
  )
}

export function createAccount(username: string) {
  return req<{ jobId: string; sponsored: boolean }>('POST', '/account/create', {
    username,
    custodyMode: 'custodial',
  })
}

export function pollJob(jobId: string) {
  return req<AccountJob>('GET', `/account/job/${encodeURIComponent(jobId)}`)
}

// ── Payments ──────────────────────────────────────────────────────────────────

export function getPaymentFee() {
  return req<PaymentFeeResponse>('GET', '/payment/fee')
}

export function createHiveIntent() {
  return req<HiveIntentResponse>('POST', '/payment/hive-intent')
}

export function createLightningIntent() {
  return req<LightningIntentResponse>('POST', '/payment/lightning-intent')
}

export function pollPaymentIntent(memo: string) {
  return req<PaymentIntentStatus>('GET', `/payment/intent/${encodeURIComponent(memo)}`)
}

// ── Hive operations ───────────────────────────────────────────────────────────

export function signMessage(message: string) {
  return req<SignMessageResult>('POST', '/hive/sign-message', { message })
}

/**
 * Broadcast one Hive operation via the auth server signing proxy.
 * The auth server expects: { op: "comment"|"vote"|..., ...opFields }
 * Each call handles exactly one operation.
 */
export function broadcastOp(opName: string, opBody: Record<string, unknown>) {
  // Server expects { op: [opTypeString, paramsObject] } — not a flat body, not { operations }.
  return req<BroadcastResult>('POST', '/hive/broadcast', { op: [opName, opBody] })
}

export function claimRewards() {
  return req<BroadcastResult>('POST', '/hive/claim-rewards')
}

export function transfer(to: string, amount: string | number, currency: string, memo = '') {
  const amountStr = typeof amount === 'number' ? amount.toFixed(3) : amount;
  return req<BroadcastResult>('POST', '/hive/transfer', { to, amount: `${amountStr} ${currency}`, memo })
}

export function powerUp(amount: number) {
  return req<BroadcastResult>('POST', '/hive/power-up', { amount: `${amount.toFixed(3)} HIVE` })
}

export function powerDown(vestingShares: string) {
  return req<BroadcastResult>('POST', '/hive/power-down', { amount: vestingShares })
}

export function delegate(delegatee: string, vestingShares: string) {
  return req<BroadcastResult>('POST', '/hive/delegate', { delegatee, amount: vestingShares })
}

export function witnessVote(witness: string, approve: boolean) {
  return req<BroadcastResult>('POST', '/hive/witness-vote', { witness, approve })
}

export function proposalVote(proposalIds: number[], approve: boolean) {
  return req<BroadcastResult>('POST', '/hive/proposal-vote', { proposalIds, approve })
}

export function transferToSavings(amount: string, to?: string, memo = '') {
  return req<BroadcastResult>('POST', '/hive/transfer-to-savings', { amount, ...(to ? { to } : {}), memo })
}

export function transferFromSavings(amount: string, to?: string, memo = '', requestId?: number) {
  return req<BroadcastResult>('POST', '/hive/transfer-from-savings', { amount, ...(to ? { to } : {}), memo, ...(requestId !== undefined ? { requestId } : {}) })
}

export function convertHbd(amount: string, requestId?: number) {
  return req<BroadcastResult>('POST', '/hive/convert', { amount, ...(requestId !== undefined ? { requestId } : {}) })
}

export function collateralizedConvert(amount: string, requestId?: number) {
  return req<BroadcastResult>('POST', '/hive/collateralized-convert', { amount, ...(requestId !== undefined ? { requestId } : {}) })
}

export function limitOrderCreate(sell: string, receive: string, fillOrKill = false, expiresInSeconds?: number, orderId?: number) {
  return req<BroadcastResult>('POST', '/hive/limit-order-create', { sell, receive, fillOrKill, ...(expiresInSeconds !== undefined ? { expiresInSeconds } : {}), ...(orderId !== undefined ? { orderId } : {}) })
}

export function limitOrderCancel(orderId: number) {
  return req<BroadcastResult>('POST', '/hive/limit-order-cancel', { orderId })
}

// ── Emancipation ─────────────────────────────────────────────────────────────

export function getEmancipationStatus() {
  return req<{ custodyMode: string; totalUsd: number; thresholdUsd: number }>(
    'GET',
    '/emancipate/status',
  )
}

export function startEmancipation() {
  return req<{ keys: { owner: string; active: string; posting: string; memo: string } }>(
    'POST',
    '/emancipate/start',
  )
}

export { AuthError as SnapieAuthError }
