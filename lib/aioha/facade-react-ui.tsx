'use client';

import { createContext, useContext, useEffect, useLayoutEffect, useState, type ComponentType, type ReactNode } from 'react';
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

// useLayoutEffect warns during SSR. The client bundle needs it so a stored
// username is published before descendant useEffects treat a null user as logout.
const useClientLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

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
  const [snapshot, setSnapshot] = useState<Snapshot>(EMPTY);

  useClientLayoutEffect(() => {
    let detach: (() => void) | undefined;
    const unsub = onAiohaReady((aioha) => {
      const inst = aioha as AiohaLike;
      const update = () => setSnapshot(snapshotFrom(inst));
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
    if (hasStoredAiohaSession()) {
      // Publish the username before child effects run. LoginModalProvider
      // treats a null user as logout and would otherwise drop hiveuser while
      // the wallet chunk is still downloading. loadAuth still runs for real.
      try {
        const user = localStorage.getItem('aiohaUsername') || undefined;
        const raw = localStorage.getItem('aiohaProvider');
        const provider = raw && (Object.values(Providers) as string[]).includes(raw)
          ? raw as Providers
          : undefined;
        if (user) {
          setSnapshot((prev) => (prev.aioha ? prev : { ...prev, user, provider }));
        }
      } catch { /* storage blocked */ }
      void ensureAioha();
    }
    return () => {
      unsub();
      detach?.();
    };
  }, []);

  return <BridgeContext.Provider value={snapshot}>{children}</BridgeContext.Provider>;
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
