'use client'
import { useMemo } from 'react'
import { KeyTypes } from '@aioha/aioha'
import type { AiohaLike } from '@snapie/hangouts-core'
import { signMessageWithAioha, transferWithAioha } from '@/lib/hive/aioha'
import { useCurrentUser } from './useCurrentUser'

/**
 * Returns an AiohaLike adapter for HangoutsProvider that routes signing and
 * boost transfers through our unified Snapie / Aioha signing layer.
 *
 * Passing this as `aioha={adapter}` ensures custodial Snapie users never hit
 * Keychain for in-room boost transfers — the transfer goes through the Snapie
 * proxy instead.
 */
export function useHangoutsAiohaAdapter(): AiohaLike {
  const { username, isLoggedIn } = useCurrentUser()

  return useMemo<AiohaLike>(() => ({
    async signMessage(msg: string) {
      try {
        return await signMessageWithAioha(msg, KeyTypes.Posting)
      } catch (err: unknown) {
        return { success: false, error: err instanceof Error ? err.message : String(err) }
      }
    },
    getCurrentUser: () => username,
    isLoggedIn: () => isLoggedIn,
    async transfer(to, amount, currency, memo) {
      try {
        return await transferWithAioha(to, amount, currency, memo)
      } catch (err: unknown) {
        return { success: false, error: err instanceof Error ? err.message : String(err) }
      }
    },
  }), [username, isLoggedIn])
}
