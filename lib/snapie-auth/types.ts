export interface SnapieUser {
  id: string
  name: string | null
  picture: string | null
  hiveUsername: string | null
  custodyMode: 'custodial' | 'emancipated' | null
  isAdmin: boolean
}

/** Extended shape returned only by GET /auth/me */
export interface SnapieMeUser extends SnapieUser {
  email: string | null
  accountValueUsd: number | null
  emancipationRequired: boolean
}

export interface QuotaResponse {
  total: number
  used: number
  remaining: number
  resetsAt: string
}

export interface PublicConfig {
  googleClientId: string
  hiveNetwork: string
}

export interface EligibilityResponse {
  canCreate: boolean
  canLinkExisting: boolean
  reason?: string
  sponsored?: boolean
}

export interface AccountJob {
  status: 'pending' | 'broadcasting' | 'acked' | 'confirmed' | 'failed' | 'expired'
  txId?: string
  error?: string
}

export interface SignMessageResponse {
  signature: string
  account: string
}

export interface NeedsClientSigningResponse {
  needsClientSigning: true
  message: string
  account: string
}

export type SignMessageResult = SignMessageResponse | NeedsClientSigningResponse

export interface BroadcastResponse {
  txId: string
  emancipationRequired?: boolean
  accountValueUsd?: number
}

export interface NeedsClientBroadcastResponse {
  needsClientSigning: true
  unsignedOp: unknown
}

export type BroadcastResult = BroadcastResponse | NeedsClientBroadcastResponse

export class SnapieAuthError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    message?: string,
  ) {
    super(message ?? code)
    this.name = 'SnapieAuthError'
  }
}
