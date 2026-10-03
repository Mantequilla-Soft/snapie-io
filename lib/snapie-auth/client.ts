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
 * Supabase-style codes plus the 409 status are both handled since the auth
 * service is external to this repo.
 */
const ACCOUNT_EXISTS_CODES = new Set([
  'email_exists',
  'email_taken',
  'user_already_exists',
  'email_already_registered',
  'email_in_use',
  'conflict',
])

/**
 * Codes meaning "no account with this email" — unambiguous signal from the
 * login call that we should fall through to registration.
 *
 * Deliberately EXCLUDES `unauthorized` / `invalid_credentials`: those are
 * ambiguous (Supabase returns them for both a wrong password and an unknown
 * email), so we never treat them as "account missing" without probing first.
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
 * Fallback rules (kept deliberately disjoint):
 *   - register fails with "account exists"  → try to sign in instead.
 *   - login fails with an unambiguous "no such account" → register instead.
 *   - login fails with `unauthorized` (ambiguous: wrong password OR unknown
 *     email) → probe with a register call. If that says the account exists,
 *     the password was simply wrong, and we rethrow the auth error. If it
 *     succeeds, the email really was unused, so registration is correct.
 *
 * `email_not_verified` (403) is never treated as a fallback trigger.
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
      const user = await login(email, password)
      return { outcome: 'signedIn', user, notice: 'alreadyRegistered' }
    }
  }

  try {
    const user = await login(email, password)
    return { outcome: 'signedIn', user }
  } catch (logErr) {
    if (isNoAccount(logErr)) {
      await register(email, password)
      return { outcome: 'registered', notice: 'accountCreated' }
    }

    const ambiguous = (logErr as AuthError)?.code === 'unauthorized' ||
      (logErr as AuthError)?.code === 'invalid_credentials'
    if (!ambiguous) throw logErr

    // Ambiguous credential failure — probe to tell "wrong password" apart
    // from "no account yet". A rejected register means the account exists.
    try {
      await register(email, password)
      return { outcome: 'registered', notice: 'accountCreated' }
    } catch (probeErr) {
      if (isAccountExists(probeErr)) {
        throw new AuthError('unauthorized', 401, undefined, true)
      }
      throw logErr
    }
  }
}

export function resendVerification() {
  return req<{ ok: true }>('POST', '/auth/email/resend')
}

// GET /auth/me returns { user: SnapieMeUser } — a superset of SnapieUser with
// email, accountValueUsd, and emancipationRequired.
export async function getMe(): Promise<SnapieMeUser> {
  const data = await req<{ user: SnapieMeUser }>('GET', '/auth/me')
  return data.user
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
