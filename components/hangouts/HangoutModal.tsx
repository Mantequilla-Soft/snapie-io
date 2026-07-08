'use client';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createPortal } from 'react-dom';
import { Center, Spinner, Text, VStack, Button, Box, useToast } from '@chakra-ui/react';
import { HangoutsProvider, HangoutsRoom, useHangoutsRoom, HangoutsApiClient } from '@snapie/hangouts-react';
import type { GameResultPayload, ChessGameResult, FastDrawGameResult } from '@snapie/hangouts-react';
import { useAioha } from '@aioha/react-ui';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useHangoutsAiohaAdapter } from '@/hooks/useHangoutsAiohaAdapter';
import { useHangout } from '@/contexts/HangoutContext';
import { useWakeLock } from '@/hooks/useWakeLock';
import { providerSignPrompt } from '@/lib/utils/aiohaProviderUi';
import '@snapie/hangouts-react/src/styles/hangouts.css';
import GameResultSnapModal from './GameResultSnapModal';

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
  onGameActiveChange: (active: boolean) => void;
}

function isWinnerOrDraw(result: GameResultPayload, user: string): boolean {
  if (!result.players.includes(user)) return false;
  if (result.gameId === 'chess') {
    const chess = result.result as ChessGameResult;
    return chess.winner === user || chess.winner === null;
  }
  if (result.gameId === 'fast-draw') {
    return (result.result as FastDrawGameResult).winners.includes(user);
  }
  // word-guess: fall back to checking a winners array if present
  const wg = result.result as any;
  if (Array.isArray(wg?.winners)) return wg.winners.includes(user);
  return true;
}

function audioExtension(blob: Blob): string {
  if (blob.type.includes('webm')) return 'webm';
  if (blob.type.includes('mp4')) return 'm4a';
  if (blob.type.includes('ogg')) return 'ogg';
  return 'webm';
}

function RoomBody({ roomName, onClose, onGameActiveChange }: RoomBodyProps) {
  const router = useRouter();
  const toast = useToast();
  const { username: user } = useCurrentUser();
  const { roomMeta } = useHangoutsRoom();
  const [roomData, setRoomData] = useState<any | null>(null);
  const [gameResult, setGameResult] = useState<GameResultPayload | null>(null);

  useEffect(() => {
    const fetchRoom = async () => {
      try {
        const client = new HangoutsApiClient({ baseUrl: API_URL });
        const rooms = await client.listRooms();
        const room = rooms.find((r: any) => r.name === roomName);
        if (room) {
          setRoomData(room);
        }
      } catch (error) {
        console.error('Failed to fetch room data:', error);
      }
    };
    fetchRoom();
  }, [roomName]);

  const buildComposeUrl = useCallback((audioUrl?: string, videoUrl?: string) => {
    const params = new URLSearchParams({
      hangout: 'true',
      title: prettifyRoomName(roomName),
    });
    const thumbnail = roomData?.backgroundImage || roomMeta?.backgroundImage || FALLBACK_HANGOUT_THUMBNAIL;
    params.set('thumbnail', thumbnail);
    if (audioUrl) params.set('audioUrl', audioUrl);
    if (videoUrl) params.set('videoUrl', videoUrl);
    return `/compose?${params.toString()}`;
  }, [roomName, roomData?.backgroundImage, roomMeta?.backgroundImage]);

  const handleAudioHandoff = useCallback(async (file: { blob: Blob; filename: string; duration: number; size: number }) => {
    const ext = audioExtension(file.blob);
    const filename = file.filename.replace(/\.\w+$/, `.${ext}`);
    triggerBlobDownload(file.blob, filename);

    if (user) {
      try {
        const { uploadAudioTo3Speak } = await import('@/lib/hive/client-functions');
        const result = await uploadAudioTo3Speak(file.blob, file.duration, user);
        if (result.success && result.playUrl) {
          router.push(buildComposeUrl(result.playUrl));
        } else {
          router.push(buildComposeUrl());
        }
      } catch {
        router.push(buildComposeUrl());
      }
    } else {
      router.push(buildComposeUrl());
    }
    onClose();
  }, [router, user, buildComposeUrl, onClose]);

  const handleVideoHandoff = useCallback(async (file: { blob: Blob; filename: string; duration: number; size: number }) => {
    triggerBlobDownload(file.blob, file.filename);

    const apiKey = process.env.NEXT_PUBLIC_3SPEAK_API_KEY;
    if (!user || !apiKey) {
      router.push(buildComposeUrl());
      onClose();
      return;
    }

    const toastId = toast({
      title: 'Uploading video…',
      description: '0%',
      status: 'loading',
      duration: null,
      isClosable: false,
    });

    try {
      const { uploadVideoTo3Speak } = await import('@snapie/operations/video');
      const videoFile = new File([file.blob], file.filename, { type: file.blob.type });
      const result = await uploadVideoTo3Speak(videoFile, {
        apiKey,
        owner: user,
        appName: 'snapie',
        isShort: false,
        onProgress: (pct: number) => {
          toast.update(toastId, { description: `${pct}%` });
        },
      });
      toast.update(toastId, {
        title: 'Upload complete!',
        description: 'Opening composer…',
        status: 'success',
        duration: 3000,
        isClosable: true,
      });
      router.push(buildComposeUrl(undefined, result.embedUrl));
    } catch {
      toast.update(toastId, {
        title: 'Upload failed',
        description: 'Your recording was saved locally.',
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
      router.push(buildComposeUrl());
    }
    onClose();
  }, [router, user, buildComposeUrl, onClose, toast]);

  const handleGameEnd = useCallback((result: GameResultPayload) => {
    if (user && isWinnerOrDraw(result, user)) {
      setGameResult(result);
    }
  }, [user]);

  return (
    <>
      <HangoutsRoom
        roomName={roomName}
        onLeave={onClose}
        onAudioHandoff={handleAudioHandoff}
        onVideoHandoff={handleVideoHandoff}
        onGameEnd={handleGameEnd}
        onActiveGameChange={gameId => onGameActiveChange(gameId !== null)}
        video
        embedded
        guestFallback
        getShareUrl={buildSnapieShareUrl}
      />
      {gameResult && user && (
        <GameResultSnapModal
          isOpen
          onClose={() => setGameResult(null)}
          result={gameResult}
          currentUser={user}
          roomName={roomName}
        />
      )}
    </>
  );
}

export default function HangoutModal({ isOpen, onClose, roomName }: HangoutModalProps) {
  useWakeLock(isOpen);
  const { aioha } = useAioha();
  const { username: user, isSnapie } = useCurrentUser();
  const aiohaAdapter = useHangoutsAiohaAdapter();
  const { sessionToken, sessionLoading, error, retryLogin } = useHangout();
  const [gameActive, setGameActive] = useState(false);

  useEffect(() => {
    if (isOpen && user && !sessionToken && !sessionLoading) {
      retryLogin(user).catch(() => {});
    }
  }, [isOpen, user, sessionToken, sessionLoading, retryLogin]);

  useEffect(() => {
    if (!isOpen) setGameActive(false);
  }, [isOpen]);

  const handleCloseClick = useCallback(() => {
    if (gameActive && !window.confirm('A game is in progress — leave anyway?')) return;
    onClose();
  }, [gameActive, onClose]);

  const needsTokenWait = !!user && !sessionToken && !error;
  const currentProvider = aioha?.getCurrentProvider?.() ?? null;
  const signPrompt = isSnapie ? 'Signing in with Snapie…' : providerSignPrompt(currentProvider);

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
          borderColor: 'var(--chakra-colors-overlay-200)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 24px 64px rgba(0, 0, 0, 0.6)',
        }}
        data-hh-theme="dark"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={handleCloseClick}
          style={{
            position: 'absolute',
            top: '18px',
            right: '18px',
            zIndex: 10,
            width: '36px',
            height: '36px',
            background: 'rgba(0, 0, 0, 0.45)',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            borderRadius: '50%',
            fontSize: '18px',
            cursor: 'pointer',
            color: 'var(--chakra-colors-text)',
            padding: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          aria-label="Close"
        >
          ✕
        </button>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
          {error ? (
            <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
              <Center flex={1} p={8}>
                <VStack spacing={3}>
                  <Text color="red.400">Failed to authenticate: {error}</Text>
                  <Button variant="ghost" onClick={() => retryLogin(user ?? undefined).catch(() => {})}>Retry</Button>
                </VStack>
              </Center>
            </div>
          ) : needsTokenWait || sessionLoading ? (
            <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
              <Center flex={1} p={8}>
                <VStack spacing={3}>
                  <Spinner size="lg" color="primary" />
                  <Text fontSize="sm" color="primary" textAlign="center">{signPrompt}</Text>
                </VStack>
              </Center>
            </div>
          ) : (
            <Box
              sx={{
                flex: 1,
                minHeight: 0,
                display: 'flex',
                flexDirection: 'column',
                '& > *': {
                  flex: 1,
                  minHeight: 0,
                  display: 'flex',
                  flexDirection: 'column',
                },
                '& > * > *': {
                  flex: 1,
                  minHeight: 0,
                },
              }}
            >
              <HangoutsProvider
                apiBaseUrl={API_URL}
                livekitServerUrl={LK_URL}
                sessionToken={sessionToken ?? undefined}
                username={user ?? undefined}
                imageServerApiKey={IMAGE_SERVER_API_KEY}
                aioha={aiohaAdapter}
              >
                <RoomBody roomName={roomName} onClose={onClose} onGameActiveChange={setGameActive} />
              </HangoutsProvider>
            </Box>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
