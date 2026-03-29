'use client';
import { useEffect, useRef } from 'react';
import { HangoutsProvider, RoomLobby, useHangoutsAuth } from '@snapie/hangouts-react';
import '@snapie/hangouts-react/src/styles/hangouts.css';
import { useHangout } from '@/contexts/HangoutContext';
import { useKeychain } from '@/contexts/KeychainContext';

const API_URL = process.env.NEXT_PUBLIC_HANGOUTS_API_URL!;
const LK_URL = process.env.NEXT_PUBLIC_LIVEKIT_URL || 'wss://livekit.3speak.tv';

function LobbyWithAutoAuth() {
  const { user } = useKeychain();
  const auth = useHangoutsAuth();
  const { openRoom } = useHangout();
  const loginAttempted = useRef(false);

  useEffect(() => {
    if (user && !auth.isAuthenticated && !auth.isLoading && !loginAttempted.current) {
      loginAttempted.current = true;
      auth.login(user).catch(() => {
        loginAttempted.current = false;
      });
    }
  }, [user, auth.isAuthenticated, auth.isLoading]);

  return <RoomLobby onJoinRoom={(name) => openRoom(name)} />;
}

export default function HangoutsPage() {
  return (
    <div data-hh-theme="dark">
      <HangoutsProvider apiBaseUrl={API_URL} livekitServerUrl={LK_URL}>
        <LobbyWithAutoAuth />
      </HangoutsProvider>
    </div>
  );
}
