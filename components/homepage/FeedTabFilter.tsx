'use client';
import React from 'react';
import { Box, Button, HStack, Spacer } from '@chakra-ui/react';
import { SnapFilterType } from '@/hooks/useSnaps';
import HiveActivityWidget from '@/components/layout/HiveActivityWidget';

interface FeedTabFilterProps {
  activeFilter: SnapFilterType;
  onFilterChange: (filter: SnapFilterType) => void;
  communityName?: string;
  isLoggedIn?: boolean;
}

export default function FeedTabFilter({
  activeFilter,
  onFilterChange,
  communityName = 'HiveBR',
  isLoggedIn = false
}: FeedTabFilterProps) {

  const tabs: { label: string; value: SnapFilterType; requiresAuth?: boolean }[] = [
    { label: 'For You', value: 'community' },
    { label: 'Latest', value: 'all' },
    { label: 'Following', value: 'following', requiresAuth: true },
    { label: 'Patrons', value: 'patrons' },
  ];

  return (
    <Box
      bg="transparent"
      position="sticky"
      top={0}
      zIndex={10}
      px={{ base: 0, md: 1 }}
      py={3}
      w="full"
    >
      <HStack
        spacing={0}
        w="full"
        px={2}
        py={1}
        bg="transparent"
        align="center"
      >
        {tabs.map((tab) => {
          const isDisabled = tab.requiresAuth && !isLoggedIn;
          const isActive = activeFilter === tab.value;

          return (
            <Button
              key={tab.value}
              onClick={() => !isDisabled && onFilterChange(tab.value)}
              size="md"
              bg="transparent"
              color={isActive ? 'white' : 'whiteAlpha.500'}
              borderRadius="full"
              borderBottom="2px solid"
              borderColor={isActive ? '#1ca1f1' : 'transparent'}
              fontWeight={isActive ? 'bold' : 'medium'}
              px={4}
              py={3}
              _hover={{
                bg: 'rgba(28, 161, 241, 0.08)',
                color: isActive ? 'white' : 'whiteAlpha.800',
                borderColor: isActive ? '#1ca1f1' : 'rgba(28, 161, 241, 0.3)',
              }}
              _active={{
                bg: 'rgba(28, 161, 241, 0.12)',
              }}
              _disabled={{
                opacity: 0.4,
                cursor: 'not-allowed',
                _hover: {
                  bg: 'transparent',
                  color: 'whiteAlpha.500',
                  borderColor: 'transparent',
                },
              }}
              isDisabled={isDisabled}
              transition="all 0.15s"
            >
              {tab.label}
            </Button>
          );
        })}
        <Spacer />
        <Box display={{ base: 'none', md: 'flex' }} alignItems="center" pr={3}>
          <HiveActivityWidget compact />
        </Box>
      </HStack>
    </Box>
  );
}
