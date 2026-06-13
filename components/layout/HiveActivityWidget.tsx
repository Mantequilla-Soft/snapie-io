'use client';
import React, { useEffect, useState } from 'react';
import { Box, Flex, Text } from '@chakra-ui/react';
import { keyframes } from '@emotion/react';

const MIN_COUNT_TO_SHOW = 100;

const pulse = keyframes`
  0%, 100% { transform: scale(1); opacity: 1; }
  50%       { transform: scale(1.35); opacity: 0.4; }
`;

interface ActiveUsersData {
  count: number | null;
  warming: boolean;
  updatedAt?: string;
}

interface HiveActivityWidgetProps {
  compact?: boolean;
}

export default function HiveActivityWidget({ compact = false }: HiveActivityWidgetProps) {
  const [data, setData] = useState<ActiveUsersData | null>(null);

  useEffect(() => {
    async function fetchCount() {
      try {
        const res = await fetch('/api/active-users');
        if (res.ok) setData(await res.json());
      } catch {
        // silently ignore — widget just stays hidden
      }
    }

    fetchCount();
    const id = setInterval(fetchCount, 60_000);
    return () => clearInterval(id);
  }, []);

  if (!data || data.warming || data.count === null || data.count < MIN_COUNT_TO_SHOW) {
    return null;
  }

  if (compact) {
    return (
      <Flex align="center" gap={1.5}>
        <Box
          w="7px"
          h="7px"
          borderRadius="full"
          bg="green.400"
          flexShrink={0}
          boxShadow="0 0 5px rgba(72, 187, 120, 0.8)"
          animation={`${pulse} 2s ease-in-out infinite`}
        />
        <Text fontSize="xs" color="whiteAlpha.700" fontWeight="500">
          {data.count.toLocaleString()}{' '}
          <Text as="span" color="whiteAlpha.400" fontWeight="400">
            online
          </Text>
        </Text>
      </Flex>
    );
  }

  return (
    <Flex align="center" gap={2} px={3} py={2}>
      <Box
        w="8px"
        h="8px"
        borderRadius="full"
        bg="green.400"
        flexShrink={0}
        boxShadow="0 0 6px rgba(72, 187, 120, 0.8)"
        animation={`${pulse} 2s ease-in-out infinite`}
      />
      <Text fontSize="xs" color="whiteAlpha.500">
        Active on Hive{' '}
        <Text as="span" color="whiteAlpha.800" fontWeight="600">
          {data.count.toLocaleString()}
        </Text>
      </Text>
    </Flex>
  );
}
