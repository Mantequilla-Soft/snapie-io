'use client';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import QRCode from 'react-qr-code';
import { getAioha, setHiveAuthCallbacks } from '@/lib/hive/aioha';

interface HiveAuthContextValue {
  isWaiting: boolean;
  waitingMessage: string;
  waitingHint: string;
  showWaiting: (msg?: string, hint?: string) => void;
  hideWaiting: () => void;
}

const HiveAuthContext = createContext<HiveAuthContextValue | null>(null);

type HiveAuthWaitEvent = (payload: string, evt: unknown, cancel: () => void) => void;

export function HiveAuthProvider({ children }: { children: ReactNode }) {
  const [isWaiting, setIsWaiting] = useState(false);
  const [waitingMessage, setWaitingMessage] = useState('');
  const [waitingHint, setWaitingHint] = useState('');
  // Populated once the HiveAuth server acks a pending challenge/sign request —
  // this `has://` payload is the deep link the mobile app auto-opens, and its
  // QR-encoded form is the only way to approve if this device's session never
  // registered for silent push (or the specific request type isn't one the
  // paired app pushes for). Before this existed, a request past that point had
  // nothing to show and nothing to do but wait out the server's 60s timeout —
  // which is what "hangs forever, never see it on my phone" actually was.
  const [qr, setQr] = useState<{ payload: string; cancel: () => void } | null>(null);

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
    setQr(null);
  }, []);

  useEffect(() => {
    setHiveAuthCallbacks(showWaiting, hideWaiting);
    return () => setHiveAuthCallbacks(null, null);
  }, [showWaiting, hideWaiting]);

  useEffect(() => {
    // hiveauth_login_request (the initial pairing QR) is already handled by
    // AiohaModal's own LoginModal. These two cover everything signed
    // afterward: signMessage (challenge_req — what image upload signs) and
    // every broadcast operation, vote/comment/transfer/etc. (sign_req).
    const onQr: HiveAuthWaitEvent = (payload, _evt, cancel) => setQr({ payload, cancel });
    const aioha = getAioha();
    aioha.on('hiveauth_challenge_request', onQr);
    aioha.on('hiveauth_sign_request', onQr);
    return () => {
      aioha.off('hiveauth_challenge_request', onQr);
      aioha.off('hiveauth_sign_request', onQr);
    };
  }, []);

  return (
    <HiveAuthContext.Provider
      value={{ isWaiting, waitingMessage, waitingHint, showWaiting, hideWaiting }}
    >
      {children}
      {isWaiting && (
        <div className="hiveauth-waiting-overlay">
          <div className="hiveauth-waiting-modal">
            {qr ? (
              <>
                <h3>Scan to Approve</h3>
                <p>{waitingMessage}</p>
                <a href={qr.payload}>
                  <div className="hiveauth-qr">
                    <QRCode value={qr.payload} size={196} />
                  </div>
                </a>
                <p className="hiveauth-hint">
                  Scan with your HiveAuth app, or tap it if you're on the same device.
                </p>
                <button type="button" className="hiveauth-cancel" onClick={qr.cancel}>
                  Cancel
                </button>
              </>
            ) : (
              <>
                <div className="hiveauth-spinner" />
                <h3>Transaction Approval</h3>
                <p>{waitingMessage}</p>
                {waitingHint && <p className="hiveauth-hint">{waitingHint}</p>}
              </>
            )}
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
