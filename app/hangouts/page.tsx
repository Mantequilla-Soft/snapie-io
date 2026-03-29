'use client';
import { useCallback } from 'react';
import { HangoutsProvider, RoomLobby, useHangoutsAuth, type Room } from '@snapie/hangouts-react';
import '@snapie/hangouts-react/src/styles/hangouts.css';
import { useHangout } from '@/contexts/HangoutContext';
import { useKeychain } from '@/contexts/KeychainContext';
import { useAutoHangoutLogin } from '@/hooks/useAutoHangoutLogin';
import { snapieHangoutComposer } from '@/lib/utils/composerSdk';
import { getLastSnapsContainer, signAndBroadcastWithKeychain } from '@/lib/hive/client-functions';
import { useToast } from '@chakra-ui/react';

const API_URL = process.env.NEXT_PUBLIC_HANGOUTS_API_URL!;
const LK_URL = process.env.NEXT_PUBLIC_LIVEKIT_URL || 'wss://livekit.3speak.tv';

function LobbyWithAutoAuth() {
  const { user } = useKeychain();
  const auth = useHangoutsAuth();
  const { openRoom } = useHangout();
  const toast = useToast();
  useAutoHangoutLogin(user, auth);

  const handleRoomCreated = useCallback(async (room: Room) => {
    // Open the room immediately — don't block on snap posting
    openRoom(room.name);

    if (!user) return;

    try {
      const { permlink: parentPermlink } = await getLastSnapsContainer();

      const body = `🎙️ ${room.title}\n\nhttps://hangout.3speak.tv/room/${room.name}`;

      const result = snapieHangoutComposer.build({
        author: user,
        body,
        parentAuthor: '',
        parentPermlink,
      });

      const response = await signAndBroadcastWithKeychain(user, result.operations, 'posting');

      if (response.success) {
        toast({
          title: 'Hangout announced!',
          description: 'Your hangout was shared to the feed',
          status: 'success',
          duration: 3000,
        });
      } else {
        toast({
          title: 'Announcement failed',
          description: response.error || 'Could not post to feed',
          status: 'warning',
          duration: 5000,
        });
      }
    } catch (err) {
      console.error('Failed to post hangout announcement:', err);
      toast({
        title: 'Announcement failed',
        description: 'Could not post to feed, but your room is live',
        status: 'warning',
        duration: 5000,
      });
    }
  }, [user, openRoom, toast]);

  return (
    <RoomLobby
      onJoinRoom={(name) => openRoom(name)}
      onRoomCreated={handleRoomCreated}
    />
  );
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
