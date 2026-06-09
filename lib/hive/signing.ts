'use client'

/**
 * Signing router — dispatches Hive operations to either the Snapie Auth proxy
 * (custodial users) or the local Aioha provider (wallet users).
 *
 * Auth mode is set by SnapieAuthContext on mount/login/logout.
 */

type AuthMode = 'snapie' | 'aioha' | null

let _mode: AuthMode = null
let _snapieUsername: string | null = null

export function setSigningAuthMode(mode: AuthMode, username?: string | null) {
  _mode = mode
  if (mode === 'snapie') {
    if (username !== undefined) _snapieUsername = username ?? null
  } else {
    _snapieUsername = null
  }
}

export function getSnapieUsername(): string | null {
  return _snapieUsername
}

export function getSigningAuthMode(): AuthMode {
  return _mode
}

export function isSnapieMode(): boolean {
  return _mode === 'snapie'
}

/**
 * Fired when an emancipated Snapie user attempts an active-key operation.
 * The server responds with needsClientSigning: true — we surface this to the UI
 * instead of silently failing so the user knows to connect their Hive wallet.
 */
export function emitNeedsWallet(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('snapie:needs-wallet'))
  }
}
