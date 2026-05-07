'use client';
import React from 'react';
import { Box, Button, HStack } from '@chakra-ui/react';
import { SnapFilterType } from '@/hooks/useSnaps';

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
    { label: communityName, value: 'community' },
    { label: 'All', value: 'all' },
    { label: 'Following', value: 'following', requiresAuth: true },
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
        spacing={2}
        justify="space-between"
        w="full"
        p={2}
        bg="rgba(8, 24, 40, 0.78)"
        border="tb1"
        borderRadius="30px"
        boxShadow="lg"
        backdropFilter="blur(18px)"
      >
        {tabs.map((tab) => {
          const isDisabled = tab.requiresAuth && !isLoggedIn;
          const isActive = activeFilter === tab.value;
          
          return (
            <Button
              key={tab.value}
              onClick={() => !isDisabled && onFilterChange(tab.value)}
              size="md"
              flex={1}
              bg={isActive ? 'linear-gradient(135deg, #18A8FF 0%, #0D7CFF 100%)' : 'transparent'}
              color={isActive ? 'white' : 'text'}
              borderWidth="1px"
              borderColor={isActive ? 'transparent' : 'transparent'}
              borderRadius="full"
              fontWeight="bold"
              boxShadow={isActive ? '0 12px 26px rgba(24, 168, 255, 0.28)' : 'none'}
              _hover={{
                bg: isActive ? 'linear-gradient(135deg, #18A8FF 0%, #0D7CFF 100%)' : 'rgba(24, 168, 255, 0.10)',
                borderColor: 'transparent',
                color: isActive ? 'white' : 'accent',
                transform: 'translateY(-2px)',
                shadow: 'md',
              }}
              _active={{
                transform: 'translateY(0)',
              }}
              _disabled={{
                opacity: 0.5,
                cursor: 'not-allowed',
                _hover: {
                  bg: 'muted',
                  borderColor: 'border',
                  color: 'text',
                  transform: 'none',
                },
              }}
              isDisabled={isDisabled}
              transition="all 0.2s"
            >
              {tab.label}
            </Button>
          );
        })}
      </HStack>
    </Box>
  );
}
