'use client'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import { getMe, logout as apiLogout } from '@/lib/snapie-auth/client'
import { invalidateSnapieMe, loadSnapieMe } from '@/lib/snapie-auth/sessionProbe'
import { setSigningAuthMode } from '@/lib/hive/signing'
import type { SnapieMeUser, SnapieUser } from '@/lib/snapie-auth/types'
import HiveClient from '@/lib/hive/hiveclient'
import { useHiveUser } from '@/contexts/UserContext'
import type { HiveAccount } from '@/hooks/useHiveAccount'

interface SnapieAuthContextValue {
  snapieUser: SnapieMeUser | null
  isSnapieLoggedIn: boolean
  isLoading: boolean
  emancipationRequired: boolean
  setSnapieUser: (user: SnapieUser | null) => void
  logoutFromSnapie: () => Promise<void>
}

const SnapieAuthContext = createContext<SnapieAuthContextValue | null>(null)

const setCookie = (name: string, value: string, days = 30) => {
  const expires = new Date()
  expires.setTime(expires.getTime() + days * 24 * 60 * 60 * 1000)
  document.cookie = `${name}=${value};expires=${expires.toUTCString()};path=/`
}

const deleteCookie = (name: string) => {
  document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/`
}

async function hydrateHiveAccount(username: string): Promise<HiveAccount | null> {
  try {
    const accounts = await HiveClient.database.getAccounts([username])
    if (!accounts?.[0]) return null
    const account: HiveAccount = { ...accounts[0] }
    try {
      account.metadata = JSON.parse(
        account.posting_json_metadata || account.json_metadata || '{}',
      )
    } catch {
      account.metadata = {}
    }
    localStorage.setItem('hiveuser', JSON.stringify(account))
    window.dispatchEvent(new Event('hiveuser-saved'))
    return account
  } catch {
    return null
  }
}

export function SnapieAuthProvider({ children }: { children: ReactNode }) {
  const [snapieUser, setSnapieUserState] = useState<SnapieMeUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const { setHiveUser } = useHiveUser()

  const applySnapieSession = useCallback(
    async (user: SnapieUser | SnapieMeUser) => {
      const meUser: SnapieMeUser = 'emancipationRequired' in user
        ? (user as SnapieMeUser)
        : { ...user, email: null, accountValueUsd: null, emancipationRequired: false }
      setSnapieUserState(meUser)
      setSigningAuthMode('snapie', user.hiveUsername ?? null)
      setCookie('hive_username', user.hiveUsername ?? '', 30)
      if (user.hiveUsername) {
        const acc = await hydrateHiveAccount(user.hiveUsername)
        if (acc) setHiveUser(acc)
      }
    },
    [setHiveUser],
  )

  // Restore a Snapie Auth cookie once per tab. A 401 (Keychain-only login)
  // or a 429 is remembered so navigation does not call /auth/me again.
  useEffect(() => {
    let cancel = false
    loadSnapieMe(getMe)
      .then((user) => {
        if (cancel || !user) return
        return applySnapieSession(user)
      })
      .finally(() => {
        if (!cancel) setIsLoading(false)
      })
    return () => {
      cancel = true
    }
  }, [applySnapieSession])

  // Called after login — base SnapieUser lacks emancipation fields, so fetch full /auth/me.
  const setSnapieUser = useCallback(
    (user: SnapieUser | null) => {
      if (user) {
        invalidateSnapieMe()
        applySnapieSession(user)
        getMe()
          .then((full) => applySnapieSession(full))
          .catch(() => {})
      } else {
        invalidateSnapieMe()
        setSnapieUserState(null)
        setSigningAuthMode(null, null)
        deleteCookie('hive_username')
        localStorage.removeItem('hiveuser')
        setHiveUser(null)
      }
    },
    [applySnapieSession],
  )

  const logoutFromSnapie = useCallback(async () => {
    await apiLogout().catch(() => {})
    invalidateSnapieMe()
    setSnapieUserState(null)
    setSigningAuthMode(null, null)
    deleteCookie('hive_username')
    localStorage.removeItem('hiveuser')
    setHiveUser(null)
  }, [setHiveUser])

  return (
    <SnapieAuthContext.Provider
      value={{
        snapieUser,
        isSnapieLoggedIn: !!snapieUser,
        isLoading,
        emancipationRequired: snapieUser?.emancipationRequired ?? false,
        setSnapieUser,
        logoutFromSnapie,
      }}
    >
      {children}
    </SnapieAuthContext.Provider>
  )
}

export function useSnapieAuth() {
  const ctx = useContext(SnapieAuthContext)
  if (!ctx) throw new Error('useSnapieAuth must be used within a SnapieAuthProvider')
  return ctx
}
