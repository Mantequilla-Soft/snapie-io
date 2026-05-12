'use client';
import { useRef } from 'react';
import { HangoutsProvider, RoomLobby, type Room } from '@snapie/hangouts-react';
import '@snapie/hangouts-react/src/styles/hangouts.css';
import './overrides.css';
import { useHangout } from '@/contexts/HangoutContext';
import { useAioha } from '@aioha/react-ui';
import { useHangoutsSession } from '@/hooks/useHangoutsSession';
import { snapieHangoutComposer } from '@/lib/utils/composerSdk';
import { getLastSnapsContainer, signAndBroadcastWithKeychain } from '@/lib/hive/client-functions';
import { useToast, Center, VStack, Text, Spinner, Button } from '@chakra-ui/react';

import { IMAGE_SERVER_API_KEY } from '@/lib/env';

const API_URL = process.env.NEXT_PUBLIC_HANGOUTS_API_URL!;
const LK_URL = process.env.NEXT_PUBLIC_LIVEKIT_URL || 'wss://livekit.3speak.tv';

interface LobbyProps {
  user: string;
  sessionToken: string | undefined;
  isLoading: boolean;
  error: string | null;
  retryLogin: () => Promise<void>;
}

function LobbyWithAutoAuth({ user, sessionToken, isLoading, error, retryLogin }: LobbyProps) {
  const { openRoom } = useHangout();
  const toast = useToast();
  const isCreating = useRef(false);

  if (error) {
    return (
      <Center p={12}>
        <VStack spacing={3}>
          <Text fontSize="xl" fontWeight="bold" color="text">Connection Failed</Text>
          <Text color="primary">{error}</Text>
          <Button colorScheme="blue" onClick={() => retryLogin().catch(() => {})}>Retry</Button>
        </VStack>
      </Center>
    );
  }

  // Gate the SDK's <RoomLobby> until we actually have a session token in hand.
  // Rendering RoomLobby unauthenticated would show its built-in Keychain-only
  // sign-in UI, bypassing our aioha flow.
  if (isLoading || !sessionToken) {
    return (
      <Center p={12}>
        <VStack spacing={3}>
          <Spinner size="lg" color="primary" />
          <Text fontSize="sm" color="primary">Connecting to Hangouts...</Text>
        </VStack>
      </Center>
    );
  }

  const handleRoomCreated = async (room: Room, options?: { notifyOnHive: boolean }) => {
    isCreating.current = true;

    // Open the room immediately — the announcement runs in the background.
    openRoom(room.name);

    // Honor the host's "Announce on Hive" checkbox from the create dialog.
    if (options && options.notifyOnHive === false) {
      isCreating.current = false;
      return;
    }

    try {
      const { author: parentAuthor, permlink: parentPermlink } = await getLastSnapsContainer();

      const body = `🎙️ ${room.title}\n\nhttps://hangout.3speak.tv/room/${room.name}`;

      const result = snapieHangoutComposer.build({
        author: user,
        body,
        parentAuthor,
        parentPermlink,
        images: room.backgroundImage ? [room.backgroundImage] : undefined,
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
    } finally {
      isCreating.current = false;
    }
  };

  const handleJoinRoom = (name: string) => {
    if (isCreating.current) return;
    openRoom(name);
  };

  return (
    <RoomLobby
      onJoinRoom={handleJoinRoom}
      onRoomCreated={handleRoomCreated}
    />
  );
}

function GuestLobby() {
  const { openRoom } = useHangout();
  return (
    <RoomLobby
      onJoinRoom={openRoom}
      allowGuestBrowse
    />
  );
}

export default function HangoutsPage() {
  const { user } = useAioha();
  const { sessionToken, isLoading, error, retryLogin } = useHangoutsSession(user ?? null, API_URL);

  // Unauthenticated visitors get a listen-only browse: they can see active
  // rooms and drop into any room as a guest via the SDK's /listen endpoint.
  if (!user) {
    return (
      <div data-hh-theme="dark">
        <HangoutsProvider
          apiBaseUrl={API_URL}
          livekitServerUrl={LK_URL}
          imageServerApiKey={IMAGE_SERVER_API_KEY}
        >
          <GuestLobby />
        </HangoutsProvider>
        <Center p={6}>
          <Text color="primary" fontSize="sm">
            Sign in with Hive to host or speak.
          </Text>
        </Center>
      </div>
    );
  }

  return (
    <div data-hh-theme="dark">
      <HangoutsProvider
        apiBaseUrl={API_URL}
        livekitServerUrl={LK_URL}
        sessionToken={sessionToken}
        username={user}
        imageServerApiKey={IMAGE_SERVER_API_KEY}
      >
        <LobbyWithAutoAuth
          user={user}
          sessionToken={sessionToken}
          isLoading={isLoading}
          error={error}
          retryLogin={retryLogin}
        />
      </HangoutsProvider>
    </div>
  );
}
