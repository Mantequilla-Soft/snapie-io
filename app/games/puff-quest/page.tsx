'use client';
import { Box, Button, Center, Heading, HStack, Link as ChakraLink, Spinner, Text, VStack, useToast } from '@chakra-ui/react';
import NextLink from 'next/link';
import { FiArrowLeft } from 'react-icons/fi';
import { useEffect, useState } from 'react';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useLoginModal } from '@/contexts/LoginModalContext';
import { usePointsSummary } from '@/hooks/usePointsSummary';
import { GAMES_FEATURE_FLAG } from '@/lib/points/config';
import { PuffQuest } from '@/components/games/puff-quest';
import { saveGameScore } from '@/lib/games/scoreClient';
import { notEnoughPointsToast } from '@/components/shared/NotEnoughPointsToast';
import type { PuffQuestResult, PuffQuestEvent } from '@/components/games/puff-quest';

export default function PuffQuestPage() {
  const { username, isLoggedIn } = useCurrentUser();
  const { openLoginModal } = useLoginModal();
  const points = usePointsSummary(username);
  const toast = useToast();

  const [sessionId, setSessionId] = useState<string>(() => crypto.randomUUID());
  const [lastResult, setLastResult] = useState<PuffQuestResult | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error' | 'duplicate'>('idle');
  const [savedPointsAwarded, setSavedPointsAwarded] = useState(0);

  if (!GAMES_FEATURE_FLAG) {
    return (
      <Box p={8} textAlign="center">
        <Heading>Snapie Quest</Heading>
        <Text mt={4} color="fg.muted">
          Not available yet
        </Text>
      </Box>
    );
  }

  if (!isLoggedIn) {
    return (
      <Box p={8} textAlign="center">
        <Heading>Snapie Quest</Heading>
        <Text mt={4} color="fg.muted">
          Please log in to play
        </Text>
        <Button mt={6} onClick={openLoginModal}>
          Log In
        </Button>
      </Box>
    );
  }

  const handleGameEvent = (event: PuffQuestEvent) => {
    // Regenerate sessionId on game-over or win so the next "PLAY AGAIN" gets a fresh session.
    // This is safe because we're NOT using key={sessionId} anymore — the SDK responds to
    // sessionId prop changes via useCallback dependencies without remounting.
    if (event.type === 'game-over' || event.type === 'win') {
      setSessionId(crypto.randomUUID());
    }
  };

  const handleGameResult = (result: PuffQuestResult) => {
    setLastResult(result);
    setSaveStatus('idle');
    setSavedPointsAwarded(0);
  };

  const handleSaveScore = async () => {
    if (!username || !lastResult) return;

    setSaveStatus('saving');
    try {
      const result = await saveGameScore(username, 'puff-quest', lastResult);

      if (result.status === 'awarded') {
        setSaveStatus('saved');
        setSavedPointsAwarded(result.pointsAwarded);
        toast({
          title: 'Score Saved!',
          description: `You earned ${result.pointsAwarded} Snapie Points.`,
          status: 'success',
          duration: 4000,
          isClosable: true,
        });
      } else if (result.status === 'duplicate') {
        setSaveStatus('duplicate');
        setSavedPointsAwarded(result.pointsAwarded);
        toast({
          title: 'Score Already Saved',
          description: `You already earned ${result.pointsAwarded} Snapie Points for this run.`,
          status: 'info',
          duration: 4000,
          isClosable: true,
        });
      } else if (result.status === 'capped') {
        setSaveStatus('error');
        toast(
          notEnoughPointsToast(
            0,
            "You've reached your daily points limit. Try again tomorrow!",
          ),
        );
      } else {
        setSaveStatus('error');
        toast({
          title: 'Error',
          description: 'Could not save your score. Please try again.',
          status: 'error',
          duration: 4000,
          isClosable: true,
        });
      }
    } catch (err) {
      setSaveStatus('error');
      toast({
        title: 'Error',
        description: 'Could not save your score. Please try again.',
        status: 'error',
        duration: 4000,
        isClosable: true,
      });
    }
  };

  const resultSlot = lastResult ? (
    <VStack spacing={3} w="full" maxW="400px">
      <Text fontSize="sm" color="fg.muted">
        Final Score: <strong>{lastResult.score}</strong>
      </Text>
      <Text fontSize="sm" color="fg.muted">
        Stages Cleared: <strong>{lastResult.stagesCleared}</strong>
      </Text>

      {saveStatus === 'saved' || saveStatus === 'duplicate' ? (
        <VStack spacing={2} w="full" textAlign="center">
          <Text fontSize="sm" color="success" fontWeight="bold">
            ✓ Saved — +{savedPointsAwarded} Snapie Points
          </Text>
          <Text fontSize="xs" color="fg.muted">
            Current Balance: {points?.balance ?? '—'}
          </Text>
        </VStack>
      ) : (
        <Button
          w="full"
          colorScheme="orange"
          onClick={handleSaveScore}
          isDisabled={saveStatus === 'saving'}
          isLoading={saveStatus === 'saving'}
        >
          {saveStatus === 'saving' ? 'Saving...' : 'Save Score'}
        </Button>
      )}
    </VStack>
  ) : null;

  return (
    <VStack spacing={6} p={6} align="stretch" maxW="1000px" mx="auto">
      <HStack>
        <ChakraLink as={NextLink} href="/games" color="accent" display="flex" alignItems="center" gap={1}>
          <Text>← Back to Games</Text>
        </ChakraLink>
      </HStack>

      <VStack align="start" spacing={2}>
        <Heading size="lg">Snapie Quest</Heading>
        <Text color="fg.muted">
          Balance: <strong>{points?.balance ?? '—'}</strong> Snapie Points
        </Text>
      </VStack>

      <Box w="full" flex={1}>
        <PuffQuest
          playerName={username}
          sessionId={sessionId}
          autoStart
          onEvent={handleGameEvent}
          onResult={handleGameResult}
          resultSlot={resultSlot}
        />
      </Box>
    </VStack>
  );
}
