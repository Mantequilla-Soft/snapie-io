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
