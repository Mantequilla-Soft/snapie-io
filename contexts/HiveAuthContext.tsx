'use client';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { setHiveAuthCallbacks } from '@/lib/hive/aioha';

interface HiveAuthContextValue {
  isWaiting: boolean;
  waitingMessage: string;
  waitingHint: string;
  showWaiting: (msg?: string, hint?: string) => void;
  hideWaiting: () => void;
}

const HiveAuthContext = createContext<HiveAuthContextValue | null>(null);

export function HiveAuthProvider({ children }: { children: ReactNode }) {
  const [isWaiting, setIsWaiting] = useState(false);
  const [waitingMessage, setWaitingMessage] = useState('');
  const [waitingHint, setWaitingHint] = useState('');

  const showWaiting = useCallback(
    (msg: string = 'Waiting for approval…', hint: string = '') => {
      setWaitingMessage(msg);
      setWaitingHint(hint);
      setIsWaiting(true);
    },
    [],
  );

  const hideWaiting = useCallback(() => {
    setIsWaiting(false);
    setWaitingMessage('');
    setWaitingHint('');
  }, []);

  useEffect(() => {
    setHiveAuthCallbacks(showWaiting, hideWaiting);
    return () => setHiveAuthCallbacks(null, null);
  }, [showWaiting, hideWaiting]);

  return (
    <HiveAuthContext.Provider
      value={{ isWaiting, waitingMessage, waitingHint, showWaiting, hideWaiting }}
    >
      {children}
      {isWaiting && (
        <div className="hiveauth-waiting-overlay">
          <div className="hiveauth-waiting-modal">
            <div className="hiveauth-spinner" />
            <h3>Transaction Approval</h3>
            <p>{waitingMessage}</p>
            {waitingHint && <p className="hiveauth-hint">{waitingHint}</p>}
          </div>
        </div>
      )}
    </HiveAuthContext.Provider>
  );
}

export function useHiveAuth() {
  const ctx = useContext(HiveAuthContext);
  if (!ctx) throw new Error('useHiveAuth must be used within a HiveAuthProvider');
  return ctx;
}
