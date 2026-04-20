'use client';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useAioha } from '@aioha/react-ui';
import { KeyTypes } from '@aioha/aioha';
import LoginModal from '@/components/auth/LoginModal';
import HiveClient from '@/lib/hive/hiveclient';
import { useHiveUser } from '@/contexts/UserContext';
import type { HiveAccount } from '@/hooks/useHiveAccount';
import { getLoginProviders } from '@/lib/hive/aioha';

interface LoginModalContextValue {
  isOpen: boolean;
  openLoginModal: () => void;
  closeLoginModal: () => void;
}

const LoginModalContext = createContext<LoginModalContextValue | null>(null);

const setCookie = (name: string, value: string, days = 30) => {
  const expires = new Date();
  expires.setTime(expires.getTime() + days * 24 * 60 * 60 * 1000);
  document.cookie = `${name}=${value};expires=${expires.toUTCString()};path=/`;
};

const deleteCookie = (name: string) => {
  document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/`;
};

async function fetchAndStoreAccount(username: string) {
  try {
    const accounts = await HiveClient.database.getAccounts([username]);
    if (!accounts?.[0]) return null;
    const account: HiveAccount = { ...accounts[0] };
    if (account.posting_json_metadata) {
      account.metadata = JSON.parse(account.posting_json_metadata);
    } else if (account.json_metadata) {
      account.metadata = JSON.parse(account.json_metadata);
    } else {
      account.metadata = {};
    }
    localStorage.setItem('hiveuser', JSON.stringify(account));
    window.dispatchEvent(new Event('hiveuser-saved'));
    return account;
  } catch (err) {
    console.error('fetchAndStoreAccount failed', err);
    return null;
  }
}

export function LoginModalProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [loginProof] = useState(() => Math.floor(Date.now() / 1000).toString());
  const { user: aiohaUser } = useAioha();
  const { setHiveUser } = useHiveUser();

  // AiohaModal lists enabled providers as <li>s. Provider registration only
  // runs client-side (see lib/hive/aioha.ts), so SSR renders <ul></ul> but the
  // first client render would render <ul><li>Keychain</li>…</ul>. Gate the
  // modal mount on a post-hydration flag to avoid the mismatch.
  useEffect(() => {
    setMounted(true);
  }, []);

  const openLoginModal = useCallback(() => setIsOpen(true), []);
  const closeLoginModal = useCallback(() => setIsOpen(false), []);

  // Bridge aioha session into the existing Keychain-based session storage.
  // When aioha logs a user in (login succeeds OR session restored from disk),
  // we mirror that into the hive_username cookie + hiveuser localStorage so
  // the rest of the app (KeychainContext, UserContext) keeps working.
  useEffect(() => {
    if (!aiohaUser) return;
    setCookie('hive_username', aiohaUser, 30);
    fetchAndStoreAccount(aiohaUser).then((acc) => {
      if (acc) setHiveUser(acc);
    });
  }, [aiohaUser, setHiveUser]);

  // When aioha loses its user (logout), clear the app session too.
  useEffect(() => {
    if (aiohaUser) return;
    const existingCookie = document.cookie.match(/(?:^|; )hive_username=([^;]+)/);
    if (!existingCookie) return;
    deleteCookie('hive_username');
    localStorage.removeItem('hiveuser');
    setHiveUser(null);
  }, [aiohaUser, setHiveUser]);

  const handleLogin = useCallback(
    async (loginResult: any) => {
      if (!loginResult || loginResult.error) {
        console.error('Aioha login failed', loginResult);
        return;
      }
      const username: string | undefined = loginResult.username;
      if (!username) return;
      setCookie('hive_username', username, 30);
      const acc = await fetchAndStoreAccount(username);
      if (acc) setHiveUser(acc);
      setIsOpen(false);
    },
    [setHiveUser],
  );

  const value = useMemo<LoginModalContextValue>(
    () => ({ isOpen, openLoginModal, closeLoginModal }),
    [isOpen, openLoginModal, closeLoginModal],
  );

  return (
    <LoginModalContext.Provider value={value}>
      {children}
      {mounted && (
        <LoginModal
          displayed={isOpen}
          onLogin={handleLogin}
          onClose={closeLoginModal}
          loginTitle="Login to Snapie"
          loginOptions={{
            msg: loginProof,
            keyType: KeyTypes.Posting,
          }}
          forceShowProviders={getLoginProviders()}
        />
      )}
    </LoginModalContext.Provider>
  );
}

export function useLoginModal() {
  const ctx = useContext(LoginModalContext);
  if (!ctx) throw new Error('useLoginModal must be used within a LoginModalProvider');
  return ctx;
}
