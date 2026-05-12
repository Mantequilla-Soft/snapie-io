'use client';
import { useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createPortal } from 'react-dom';
import { Center, Spinner, Text, VStack, Button, Box } from '@chakra-ui/react';
import { HangoutsProvider, HangoutsRoom, useHangoutsRoom } from '@snapie/hangouts-react';
import { useAioha } from '@aioha/react-ui';
import { useHangout } from '@/contexts/HangoutContext';
import { useWakeLock } from '@/hooks/useWakeLock';
import { providerSignPrompt } from '@/lib/utils/aiohaProviderUi';
import '@snapie/hangouts-react/src/styles/hangouts.css';

import { IMAGE_SERVER_API_KEY } from '@/lib/env';

const API_URL = process.env.NEXT_PUBLIC_HANGOUTS_API_URL!;
const LK_URL = process.env.NEXT_PUBLIC_LIVEKIT_URL || 'wss://livekit.3speak.tv';

const FALLBACK_HANGOUT_THUMBNAIL = 'https://files.peakd.com/file/peakd-hive/meno/AKDgvpgFrvsp3fEazRgb971Pm8N7NqV3TUt1dF4TUY9798tUJHfZvwHE2BZB56Y.png';

// Rooms created from these hosts share via Snapie's deep-link route so the
// recipient lands inside their existing Snapie session. Anything else falls
// back to the SDK default (standalone hangout.3speak.tv).
const SNAPIE_HOSTS = new Set(['snapie.io', 'www.snapie.io']);

function buildSnapieShareUrl(roomName: string, origin: string | undefined): string {
  if (origin && SNAPIE_HOSTS.has(origin)) {
    return `https://snapie.io/hangouts/${roomName}`;
  }
  return `https://hangout.3speak.tv/room/${roomName}`;
}

interface HangoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  roomName: string;
}

function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Defer revoke so the browser has time to start the download.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function prettifyRoomName(name: string): string {
  return name.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

interface RoomBodyProps {
  roomName: string;
  onClose: () => void;
}

function RoomBody({ roomName, onClose }: RoomBodyProps) {
  const router = useRouter();
  const { roomMeta } = useHangoutsRoom();

  const buildComposeUrl = useCallback(() => {
    const params = new URLSearchParams({
      hangout: 'true',
      title: prettifyRoomName(roomName),
    });
    const thumbnail = roomMeta?.backgroundImage || FALLBACK_HANGOUT_THUMBNAIL;
    params.set('thumbnail', thumbnail);
    return `/compose?${params.toString()}`;
  }, [roomName, roomMeta?.backgroundImage]);

  const handleAudioHandoff = useCallback((file: { blob: Blob; filename: string; duration: number; size: number }) => {
    triggerBlobDownload(file.blob, file.filename);
    router.push(buildComposeUrl());
    onClose();
  }, [router, buildComposeUrl, onClose]);

  const handleVideoHandoff = useCallback((file: { blob: Blob; filename: string; duration: number; size: number }) => {
    triggerBlobDownload(file.blob, file.filename);
    router.push(buildComposeUrl());
    onClose();
  }, [router, buildComposeUrl, onClose]);

  return (
    <HangoutsRoom
      roomName={roomName}
      onLeave={onClose}
      onAudioHandoff={handleAudioHandoff}
      onVideoHandoff={handleVideoHandoff}
      video
      embedded
      guestFallback
      getShareUrl={buildSnapieShareUrl}
    />
  );
}

export default function HangoutModal({ isOpen, onClose, roomName }: HangoutModalProps) {
  useWakeLock(isOpen);
  const { user, aioha } = useAioha();
  const { sessionToken, sessionLoading, error, retryLogin } = useHangout();

  useEffect(() => {
    if (isOpen && user && !sessionToken && !sessionLoading) {
      retryLogin(user).catch(() => {});
    }
  }, [isOpen, user, sessionToken, sessionLoading, retryLogin]);

  const needsTokenWait = !!user && !sessionToken && !error;
  const currentProvider = aioha?.getCurrentProvider?.() ?? null;
  const signPrompt = providerSignPrompt(currentProvider);

  if (!isOpen) return null;

  return createPortal(
    <div
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.72)',
          backdropFilter: 'blur(6px)',
        }}
      />
      <div
        style={{
          position: 'relative',
          zIndex: 1001,
          width: 'min(96vw, 1280px)',
          aspectRatio: '16 / 9',
          maxHeight: '92vh',
          background: 'var(--chakra-colors-background)',
          color: 'var(--chakra-colors-text)',
          borderRadius: '16px',
          borderWidth: '1px',
          borderColor: 'rgba(255, 255, 255, 0.1)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
        data-hh-theme="dark"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '12px',
            right: '12px',
            zIndex: 10,
            background: 'none',
            border: 'none',
            fontSize: '24px',
            cursor: 'pointer',
            color: 'var(--chakra-colors-text)',
            padding: '4px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          aria-label="Close"
        >
          ✕
        </button>

        {error ? (
          <Center flex={1} p={8}>
            <VStack spacing={3}>
              <Text color="red.400">Failed to authenticate: {error}</Text>
              <Button variant="ghost" onClick={() => retryLogin(user ?? undefined).catch(() => {})}>Retry</Button>
            </VStack>
          </Center>
        ) : needsTokenWait || sessionLoading ? (
          <Center flex={1} p={8}>
            <VStack spacing={3}>
              <Spinner size="lg" color="primary" />
              <Text fontSize="sm" color="primary" textAlign="center">{signPrompt}</Text>
            </VStack>
          </Center>
        ) : (
          <HangoutsProvider
            apiBaseUrl={API_URL}
            livekitServerUrl={LK_URL}
            sessionToken={sessionToken ?? undefined}
            username={user ?? undefined}
            imageServerApiKey={IMAGE_SERVER_API_KEY}
          >
            <RoomBody roomName={roomName} onClose={onClose} />
          </HangoutsProvider>
        )}
      </div>
    </div>,
    document.body
  );
}
