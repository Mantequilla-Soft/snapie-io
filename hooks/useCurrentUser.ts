'use client'
import { useAioha } from '@aioha/react-ui'
import { useSnapieAuth } from '@/contexts/SnapieAuthContext'

/**
 * Single source of truth for "who is logged in" regardless of auth method.
 * Merges Aioha wallet sessions and Snapie Auth custodial sessions.
 */
export function useCurrentUser() {
  const { user: aiohaUser, aioha } = useAioha()
  const { snapieUser, isSnapieLoggedIn, logoutFromSnapie } = useSnapieAuth()

  const username = aiohaUser ?? snapieUser?.hiveUsername ?? null
  const isLoggedIn = !!username

  const logout = () => {
    if (aiohaUser) {
      aioha.logout()
    } else if (isSnapieLoggedIn) {
      logoutFromSnapie()
    }
  }

  return { username, isLoggedIn, isSnapie: isSnapieLoggedIn, logout }
}
