'use client';

import { createContext, useContext, useEffect, useMemo, useState, type ComponentType, type ReactNode } from 'react';
import { ensureAioha, hasStoredAiohaSession, onAiohaReady } from '@/lib/hive/aioha';
import { loadRealAiohaReactUi } from '@/lib/aioha/load-real';
import { Providers } from '@/lib/aioha/enums';

// Aioha's event payloads differ per event name. `any` keeps those listeners assignable.
type AiohaListener = (...args: any[]) => void;

type AiohaLike = {
  getCurrentUser: () => string | undefined;
  getCurrentProvider: () => Providers | undefined;
  getOtherLogins?: () => Record<string, unknown>;
  on: (event: string, cb: AiohaListener) => void;
  off: (event: string, cb: AiohaListener) => void;
  logout: () => void;
};

type Snapshot = {
  aioha: AiohaLike | null;
  user?: string;
  provider?: Providers;
  otherUsers: Record<string, unknown>;
};

const EMPTY: Snapshot = { aioha: null, user: undefined, provider: undefined, otherUsers: {} };

const BridgeContext = createContext<Snapshot | null>(null);

// Stored wallet identity. The first render stays logged-out so it matches the
// server HTML. Reading localStorage in useLayoutEffect (or publishing it
// through useSyncExternalStore) made React 19 replay that update while
// descendants were still hydrating, so a logged-in <a> was compared to a
// logged-out <button>. The read happens in useEffect, after that commit.
type StoredSession = { user?: string; provider?: Providers };

type BridgeApi = {
  setStored: (update: StoredSession | ((prev: StoredSession) => StoredSession)) => void;
  setLive: (snapshot: Snapshot) => void;
};
const BridgeApiContext = createContext<BridgeApi | null>(null);
const LOGGED_OUT: StoredSession = { user: undefined, provider: undefined };

function readStoredSession(): StoredSession {
  if (typeof window === 'undefined') return LOGGED_OUT;
  try {
    const user = localStorage.getItem('aiohaUsername') || undefined;
    const raw = localStorage.getItem('aiohaProvider');
    const provider = raw && (Object.values(Providers) as string[]).includes(raw)
      ? raw as Providers
      : undefined;
    if (!user) return LOGGED_OUT;
    return { user, provider };
  } catch {
    return LOGGED_OUT;
  }
}

function snapshotFrom(aioha: AiohaLike): Snapshot {
  return {
    aioha,
    user: aioha.getCurrentUser() || undefined,
    provider: aioha.getCurrentProvider(),
    otherUsers: aioha.getOtherLogins?.() ?? {},
  };
}

// Replaces @aioha/react-ui's provider in the shell. Children render immediately.
// The real library is imported only to restore a stored wallet session, or when
// the wallet modal opens.
export function AiohaProvider({ children }: { children: ReactNode; aioha?: unknown }) {
  const [stored, setStored] = useState<StoredSession>(LOGGED_OUT);
  const [live, setLive] = useState<Snapshot>(EMPTY);
  const api = useMemo<BridgeApi>(() => ({ setStored, setLive }), []);

  // Once the library is connected, its user wins (including a real logout).
  // Until then, the stored username keeps the shell in the logged-in shape.
  const snapshot: Snapshot = live.aioha
    ? live
    : { aioha: null, user: stored.user, provider: stored.provider, otherUsers: {} };

  return (
    <BridgeApiContext.Provider value={api}>
      <BridgeContext.Provider value={snapshot}>{children}</BridgeContext.Provider>
    </BridgeApiContext.Provider>
  );
}

// Mount this inside the layout suspense boundary (see LayoutContent). Its
// effect runs only after that boundary has hydrated, so publishing the stored
// username is a normal update instead of a hydration mismatch.
export function AiohaSessionRestore() {
  const api = useContext(BridgeApiContext);

  useEffect(() => {
    if (!api) return;
    const publishStored = () => {
      const next = readStoredSession();
      api.setStored((prev) => (
        prev.user === next.user && prev.provider === next.provider ? prev : next
      ));
    };
    publishStored();
    let detach: (() => void) | undefined;
    const unsub = onAiohaReady((aioha) => {
      const inst = aioha as AiohaLike;
      const update = () => api.setLive(snapshotFrom(inst));
      update();
      inst.on('connect', update);
      inst.on('disconnect', update);
      inst.on('account_changed', update);
      detach = () => {
        inst.off('connect', update);
        inst.off('disconnect', update);
        inst.off('account_changed', update);
      };
    });
    if (hasStoredAiohaSession()) void ensureAioha();
    const onStorage = (event: StorageEvent) => {
      if (event.key === 'aiohaUsername' || event.key === 'aiohaProvider' || event.key === null) {
        publishStored();
      }
    };
    window.addEventListener('storage', onStorage);
    return () => {
      unsub();
      detach?.();
      window.removeEventListener('storage', onStorage);
    };
  }, [api]);

  return null;
}

export function useAioha() {
  const ctx = useContext(BridgeContext);
  if (!ctx) throw new Error('useAioha must be used within an AiohaProvider');
  return ctx;
}

type ModalProps = { displayed?: boolean; [key: string]: unknown };

// The real modal reads the real Aioha context, so it gets its own provider
// around just this tree. The rest of the app keeps the bridge above and does
// not remount when the library arrives.
export function AiohaModal(props: ModalProps) {
  const [Real, setReal] = useState<ComponentType<ModalProps> | null>(null);
  const [Provider, setProvider] = useState<ComponentType<{ aioha: unknown; children: ReactNode }> | null>(null);
  const [instance, setInstance] = useState<unknown>(null);

  useEffect(() => {
    if (!props.displayed) return;
    let cancelled = false;
    (async () => {
      const aioha = await ensureAioha();
      const mod = await loadRealAiohaReactUi();
      if (cancelled) return;
      setInstance(aioha);
      setProvider(() => mod.AiohaProvider as unknown as ComponentType<{ aioha: unknown; children: ReactNode }>);
      setReal(() => mod.AiohaModal as unknown as ComponentType<ModalProps>);
    })();
    return () => {
      cancelled = true;
    };
  }, [props.displayed]);

  if (!props.displayed || !Real || !Provider || !instance) return null;
  return (
    <Provider aioha={instance}>
      <Real {...props} />
    </Provider>
  );
}
