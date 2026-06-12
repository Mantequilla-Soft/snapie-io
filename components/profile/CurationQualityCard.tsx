'use client';
import React, { useState } from 'react';
import {
  Box, Flex, Text, Collapse, Progress, Link, HStack, Spinner, VStack,
} from '@chakra-ui/react';
import { FaChevronDown, FaChevronUp, FaExternalLinkAlt } from 'react-icons/fa';
import { useCurationScore } from '@/hooks/useCurationScore';

function scoreColorScheme(score: number) {
  if (score >= 86) return { bg: 'purple.500', bar: 'purple' };
  if (score >= 66) return { bg: 'green.500', bar: 'green' };
  if (score >= 41) return { bg: 'yellow.500', bar: 'yellow' };
  return { bg: 'red.500', bar: 'red' };
}

function scoreLabel(score: number): string {
  if (score >= 86) return 'Excellent';
  if (score >= 66) return 'Good';
  if (score >= 41) return 'Fair';
  return 'Poor';
}

function subScoreColorScheme(value: number): string {
  if (value >= 0.66) return 'green';
  if (value >= 0.41) return 'yellow';
  return 'red';
}

function SubScoreBar({ label, value, tooltip }: { label: string; value: number; tooltip: string }) {
  const pct = Math.round(value * 100);
  return (
    <Box>
      <Flex justify="space-between" mb={1}>
        <Text fontSize="xs" color="gray.400" title={tooltip}>{label}</Text>
        <Text fontSize="xs" fontWeight="bold" color="text">{pct}%</Text>
      </Flex>
      <Progress
        value={pct}
        size="sm"
        borderRadius="full"
        colorScheme={subScoreColorScheme(value)}
        bg="muted"
      />
    </Box>
  );
}

export default function CurationQualityCard({ username }: { username: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const { data, isLoading, error } = useCurationScore(username);

  if (isLoading) {
    return (
      <Box border="1px solid" borderColor="muted" borderRadius="10px" p={3}>
        <Flex align="center" gap={2}>
          <Spinner size="xs" color="primary" />
          <Text fontSize="xs" color="gray.500">Loading curation score…</Text>
        </Flex>
      </Box>
    );
  }

  if (!data || error) return null;

  const { bg, bar } = scoreColorScheme(data.score);
  const label = scoreLabel(data.score);

  return (
    <Box border="1px solid" borderColor="muted" borderRadius="10px" overflow="hidden">
      <Flex
        px={4}
        py={3}
        align="center"
        justify="space-between"
        cursor="pointer"
        onClick={() => setIsOpen(v => !v)}
        _hover={{ bg: 'muted' }}
        transition="background 0.15s"
        userSelect="none"
      >
        <HStack spacing={2}>
          <Text fontSize="xs" fontWeight="bold" textTransform="uppercase" letterSpacing="wider" color="gray.500">
            Curation Score
          </Text>
          <Flex align="center" bg={bg} color="white" borderRadius="md" px={2} py="2px" gap={1}>
            <Text fontSize="xs" fontWeight="bold" lineHeight="1">{data.score}</Text>
            <Text fontSize="xs" opacity={0.7} lineHeight="1">·</Text>
            <Text fontSize="xs" lineHeight="1">{label}</Text>
          </Flex>
        </HStack>
        <Box color="gray.500" fontSize="10px">
          {isOpen ? <FaChevronUp /> : <FaChevronDown />}
        </Box>
      </Flex>

      <Collapse in={isOpen} animateOpacity>
        <Box px={4} pb={4} borderTop="1px solid" borderColor="muted">
          <VStack spacing={2} align="stretch" mt={3} mb={4}>
            <SubScoreBar
              label="Author Diversity"
              value={data.subScores.breadth}
              tooltip="How many different authors this account votes for"
            />
            <SubScoreBar
              label="Vote Distribution"
              value={data.subScores.distribution}
              tooltip="How evenly vote weight is spread — lower Gini coefficient is better"
            />
            <SubScoreBar
              label="Anti Self-Vote"
              value={data.subScores.antiSelf}
              tooltip="Penalises self-voting; 100% means no self-votes cast"
            />
          </VStack>

          <HStack spacing={4} mb={3} flexWrap="wrap">
            <Box textAlign="center">
              <Text fontSize="sm" fontWeight="bold" color="text">{data.metrics.voteCount}</Text>
              <Text fontSize="xs" color="gray.500">Votes (7d)</Text>
            </Box>
            <Box textAlign="center">
              <Text fontSize="sm" fontWeight="bold" color="text">{data.metrics.uniqueAuthors}</Text>
              <Text fontSize="xs" color="gray.500">Authors</Text>
            </Box>
            <Box textAlign="center">
              <Text fontSize="sm" fontWeight="bold" color="text">
                {(data.metrics.giniCoefficient * 100).toFixed(0)}%
              </Text>
              <Text fontSize="xs" color="gray.500">Gini</Text>
            </Box>
          </HStack>

          <Link
            href={`https://mantecurated.3speak.tv/@${username}`}
            isExternal
            fontSize="xs"
            color="primary"
            _hover={{ textDecoration: 'underline' }}
          >
            <Flex align="center" gap={1}>
              <Text>View full curator profile</Text>
              <FaExternalLinkAlt size={10} />
            </Flex>
          </Link>
        </Box>
      </Collapse>
    </Box>
  );
}
