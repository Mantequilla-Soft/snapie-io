'use client'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { useAioha } from '@aioha/react-ui'
import { KeyTypes } from '@aioha/aioha'
import LoginModal from '@/components/auth/LoginModal'
import HiveClient from '@/lib/hive/hiveclient'
import { useHiveUser } from '@/contexts/UserContext'
import { useSnapieAuth } from '@/contexts/SnapieAuthContext'
import { setSigningAuthMode } from '@/lib/hive/signing'
import type { HiveAccount } from '@/hooks/useHiveAccount'
import type { SnapieUser } from '@/lib/snapie-auth/types'
import { getLoginProviders } from '@/lib/hive/aioha'

interface LoginModalContextValue {
  isOpen: boolean
  openLoginModal: () => void
  closeLoginModal: () => void
}

const LoginModalContext = createContext<LoginModalContextValue | null>(null)

const setCookie = (name: string, value: string, days = 30) => {
  const expires = new Date()
  expires.setTime(expires.getTime() + days * 24 * 60 * 60 * 1000)
  document.cookie = `${name}=${value};expires=${expires.toUTCString()};path=/`
}

const deleteCookie = (name: string) => {
  document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/`
}

export async function fetchAndStoreAccount(username: string): Promise<HiveAccount | null> {
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
  } catch (err) {
    console.error('fetchAndStoreAccount failed', err)
    return null
  }
}

export function LoginModalProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [loginProof] = useState(() => Math.floor(Date.now() / 1000).toString())
  const { user: aiohaUser } = useAioha()
  const { setHiveUser } = useHiveUser()
  const { setSnapieUser, isSnapieLoggedIn } = useSnapieAuth()

  useEffect(() => { setMounted(true) }, [])

  const openLoginModal = useCallback(() => setIsOpen(true), [])
  const closeLoginModal = useCallback(() => setIsOpen(false), [])

  // Sync Aioha session into app-wide storage (only when not in Snapie mode).
  useEffect(() => {
    if (!aiohaUser || isSnapieLoggedIn) return
    setSigningAuthMode('aioha')
    setCookie('hive_username', aiohaUser, 30)
    fetchAndStoreAccount(aiohaUser).then((acc) => {
      if (acc) setHiveUser(acc)
    })
  }, [aiohaUser, setHiveUser, isSnapieLoggedIn])

  // Clear session on Aioha logout (only when not in Snapie mode).
  useEffect(() => {
    if (aiohaUser || isSnapieLoggedIn) return
    const existingCookie = document.cookie.match(/(?:^|; )hive_username=([^;]+)/)
    if (!existingCookie) return
    setSigningAuthMode(null)
    deleteCookie('hive_username')
    localStorage.removeItem('hiveuser')
    setHiveUser(null)
  }, [aiohaUser, setHiveUser, isSnapieLoggedIn])

  // Called when Aioha login succeeds (wallet providers).
  const handleAiohaLogin = useCallback(
    async (loginResult: any) => {
      if (!loginResult || loginResult.error) return
      const username: string | undefined = loginResult.username
      if (!username) return
      setSigningAuthMode('aioha')
      setCookie('hive_username', username, 30)
      const acc = await fetchAndStoreAccount(username)
      if (acc) setHiveUser(acc)
      setIsOpen(false)
    },
    [setHiveUser],
  )

  // Called when Snapie Auth login succeeds (Google or email).
  // If the user has no Hive account yet, the modal stays open and transitions
  // to the account setup view internally — we just persist the session here.
  const handleSnapieLoginSuccess = useCallback(
    async (user: SnapieUser) => {
      setSnapieUser(user)
      if (user.hiveUsername) {
        setCookie('hive_username', user.hiveUsername, 30)
        const acc = await fetchAndStoreAccount(user.hiveUsername)
        if (acc) setHiveUser(acc)
        setIsOpen(false)
      }
      // No hiveUsername → modal stays open; LoginModal handles account setup view.
    },
    [setSnapieUser, setHiveUser],
  )

  const value = useMemo<LoginModalContextValue>(
    () => ({ isOpen, openLoginModal, closeLoginModal }),
    [isOpen, openLoginModal, closeLoginModal],
  )

  return (
    <LoginModalContext.Provider value={value}>
      {children}
      {mounted && (
        <LoginModal
          displayed={isOpen}
          onSnapieLoginSuccess={handleSnapieLoginSuccess}
          onAiohaLogin={handleAiohaLogin}
          onClose={closeLoginModal}
          loginOptions={{ msg: loginProof, keyType: KeyTypes.Posting }}
          forceShowProviders={getLoginProviders()}
        />
      )}
    </LoginModalContext.Provider>
  )
}

export function useLoginModal() {
  const ctx = useContext(LoginModalContext)
  if (!ctx) throw new Error('useLoginModal must be used within a LoginModalProvider')
  return ctx
}
