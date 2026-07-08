'use client';
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Box, Button, HStack, Text, Textarea, VStack } from '@chakra-ui/react';
import type { GameResultPayload, ChessGameResult } from '@snapie/hangouts-react';
import { buildLichessAnalysisUrl, formatWordGuessRecap, formatFastDrawRecap, type WordGuessGameResult, type FastDrawGameResult } from '@snapie/hangouts-core';
import { snapieComposer } from '@/lib/utils/composerSdk';
import { getLastSnapsContainer, signAndBroadcastWithKeychain } from '@/lib/hive/client-functions';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  result: GameResultPayload;
  currentUser: string;
  roomName: string;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function buildSnapBody(result: GameResultPayload, currentUser: string, roomName: string): string {
  const roomUrl = `https://snapie.io/hangouts/${roomName}`;
  const duration = formatDuration(result.duration);

  if (result.gameId === 'chess') {
    const chess = result.result as ChessGameResult;
    const opponent = Object.values(chess.players).find(p => p !== currentUser) ?? 'opponent';
    const moves = chess.moveHistory.length;
    const replay = buildLichessAnalysisUrl(chess.moveHistory);

    if (chess.winner === currentUser) {
      const verb = chess.status === 'checkmate' ? 'checkmated' : 'defeated';
      return `♟️ Just ${verb} @${opponent} in a chess match on Snapie Hangouts!\n\n${moves} moves · ${duration}\n\nReplay: ${replay}\n\n${roomUrl}\n\n#chess #hangouts #snapie`;
    }
    return `♟️ Just played a chess draw against @${opponent} on Snapie Hangouts!\n\n${moves} moves · ${duration}\n\nReplay: ${replay}\n\n${roomUrl}\n\n#chess #hangouts #snapie`;
  }

  if (result.gameId === 'fast-draw') {
    const recap = formatFastDrawRecap(result.result as FastDrawGameResult);
    return `${recap}\n\n${duration}\n\n${roomUrl}\n\n#fastdraw #hangouts #snapie`;
  }

  // word-guess
  const recap = formatWordGuessRecap(result.result as WordGuessGameResult);
  return `${recap}\n\n${roomUrl}\n\n#wordguess #hangouts #snapie`;
}

function getHeadline(result: GameResultPayload, currentUser: string): string {
  if (result.gameId === 'chess') {
    const chess = result.result as ChessGameResult;
    if (chess.winner === currentUser) return '♟️ You won!';
    return '♟️ Draw!';
  }
  if (result.gameId === 'fast-draw') return '🎨 You won Fast Draw!';
  return '🔤 You won Word Guess!';
}

export default function GameResultSnapModal({ isOpen, onClose, result, currentUser, roomName }: Props) {
  const [body, setBody] = useState(() => buildSnapBody(result, currentUser, roomName));
  const [isPosting, setIsPosting] = useState(false);
  const [posted, setPosted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  async function handlePost() {
    setIsPosting(true);
    setError(null);
    try {
      const { author: parentAuthor, permlink: parentPermlink } = await getLastSnapsContainer();
      const built = snapieComposer.build({ author: currentUser, body, parentAuthor, parentPermlink });
      const res = await signAndBroadcastWithKeychain(currentUser, built.operations, 'posting');
      if (res.success) {
        setPosted(true);
      } else {
        setError(res.error || 'Failed to post. Please try again.');
      }
    } catch (e: any) {
      setError(e?.message || 'Unexpected error. Please try again.');
    } finally {
      setIsPosting(false);
    }
  }

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
        onClick={onClose}
      />
      <Box
        position="relative"
        zIndex={2001}
        bg="var(--chakra-colors-background)"
        border="1px solid var(--chakra-colors-overlay-300)"
        borderRadius="16px"
        p={6}
        w="min(480px, 92vw)"
        boxShadow="0 24px 64px rgba(0,0,0,0.6)"
      >
        {posted ? (
          <VStack spacing={4} align="center">
            <Text fontSize="2xl">✅</Text>
            <Text fontWeight="bold" color="text">Snap posted!</Text>
            <Button onClick={onClose} colorScheme="blue" w="full">Close</Button>
          </VStack>
        ) : (
          <VStack spacing={4} align="stretch">
            <Text fontWeight="bold" fontSize="lg" color="text">{getHeadline(result, currentUser)}</Text>
            <Text fontSize="sm" color="overlay.500">Share your result as a snap:</Text>
            <Textarea
              value={body}
              onChange={e => setBody(e.target.value)}
              rows={6}
              resize="vertical"
              bg="var(--chakra-colors-overlay-50)"
              border="1px solid var(--chakra-colors-overlay-300)"
              borderRadius="8px"
              color="text"
              fontSize="sm"
              _focus={{ borderColor: 'blue.400', outline: 'none' }}
            />
            {error && <Text color="red.400" fontSize="sm">{error}</Text>}
            <HStack justify="flex-end" spacing={3}>
              <Button variant="ghost" onClick={onClose} isDisabled={isPosting}>Dismiss</Button>
              <Button
                colorScheme="blue"
                onClick={handlePost}
                isLoading={isPosting}
                isDisabled={!body.trim()}
              >
                Post Snap
              </Button>
            </HStack>
          </VStack>
        )}
      </Box>
    </div>,
    document.body
  );
}
