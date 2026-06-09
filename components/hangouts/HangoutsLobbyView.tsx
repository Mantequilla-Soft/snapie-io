'use client';
import { useEffect, useRef } from 'react';
import { HangoutsProvider, RoomLobby, type Room } from '@snapie/hangouts-react';
import '@snapie/hangouts-react/src/styles/hangouts.css';
import '@/app/hangouts/overrides.css';
import { useHangout } from '@/contexts/HangoutContext';
import { useAioha } from '@aioha/react-ui';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { snapieHangoutComposer } from '@/lib/utils/composerSdk';
import { getLastSnapsContainer, signAndBroadcastWithKeychain } from '@/lib/hive/client-functions';
import { providerSignPrompt } from '@/lib/utils/aiohaProviderUi';
import { useToast, Center, VStack, Text, Spinner, Button } from '@chakra-ui/react';

import { IMAGE_SERVER_API_KEY } from '@/lib/env';

const API_URL = process.env.NEXT_PUBLIC_HANGOUTS_API_URL!;
const LK_URL = process.env.NEXT_PUBLIC_LIVEKIT_URL || 'wss://livekit.3speak.tv';

interface HangoutsLobbyViewProps {
  // When set, auto-opens the room modal on mount (deep-link route).
  roomName?: string;
}

function AuthLobby({ user }: { user: string }) {
  const { openRoom } = useHangout();
  const toast = useToast();
  const isCreating = useRef(false);

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

export default function HangoutsLobbyView({ roomName }: HangoutsLobbyViewProps) {
  const { aioha } = useAioha();
  const { username: user } = useCurrentUser();
  const { openRoom, sessionToken, sessionLoading, error, retryLogin } = useHangout();

  // Lazy-sign on landing — the context no longer auto-signs on user change.
  useEffect(() => {
    if (user && !sessionToken && !sessionLoading && !error) {
      retryLogin(user).catch(() => {});
    }
  }, [user, sessionToken, sessionLoading, error, retryLogin]);

  // Deep link: /hangouts/:roomName auto-opens the modal on mount. Tracked so
  // closing the modal doesn't reopen on the next render (the URL still
  // carries the param). A fresh nav to a different room name re-fires.
  const openedDeepLinkRef = useRef<string | null>(null);
  useEffect(() => {
    if (!roomName) return;
    if (openedDeepLinkRef.current === roomName) return;
    openedDeepLinkRef.current = roomName;
    openRoom(roomName);
  }, [roomName, openRoom]);

  // Unauthenticated visitors: public listen-only browse via the SDK's
  // /listen endpoint, with a sign-in nudge at the bottom.
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
            Sign in with Hive to host a room.
          </Text>
        </Center>
      </div>
    );
  }

  if (error) {
    return (
      <Center p={12}>
        <VStack spacing={3}>
          <Text fontSize="xl" fontWeight="bold" color="text">Connection Failed</Text>
          <Text color="primary">{error}</Text>
          <Button colorScheme="blue" onClick={() => retryLogin(user).catch(() => {})}>Retry</Button>
        </VStack>
      </Center>
    );
  }

  // Wait for the hangouts session token. Surface which wallet to look at —
  // HiveAuth in particular silently waits on a phone push otherwise.
  if (sessionLoading || !sessionToken) {
    const currentProvider = aioha?.getCurrentProvider?.() ?? null;
    const signPrompt = providerSignPrompt(currentProvider);
    return (
      <Center p={12}>
        <VStack spacing={3}>
          <Spinner size="lg" color="primary" />
          <Text fontSize="sm" color="primary" textAlign="center">{signPrompt}</Text>
        </VStack>
      </Center>
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
        <AuthLobby user={user} />
      </HangoutsProvider>
    </div>
  );
}
