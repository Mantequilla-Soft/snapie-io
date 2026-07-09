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
  /** Discovery Engine Phase 1 — only rendered for allowlisted accounts, same
   *  gate as the interleaved trending badges (see lib/discovery/config.ts).
   *  Invisible to everyone else, same as the rest of this feature. */
  showTrending?: boolean;
}

export default function FeedTabFilter({
  activeFilter,
  onFilterChange,
  communityName = 'HiveBR',
  isLoggedIn = false,
  showTrending = false,
}: FeedTabFilterProps) {

  const tabs: { label: string; value: SnapFilterType; requiresAuth?: boolean }[] = [
    { label: 'For You', value: 'community' },
    { label: 'Latest', value: 'all' },
    { label: 'Following', value: 'following', requiresAuth: true },
    { label: 'Patrons', value: 'patrons' },
    ...(showTrending ? [{ label: 'Trending', value: 'trending' as const }] : []),
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
        {/* Scrolls horizontally instead of overflowing/wrapping once there are
            more tabs than fit — on a narrow phone, 4 tabs already reach the
            edge of the screen with no room to spare, so a 5th tab needs this
            rather than just being squeezed in. minW={0} is required here:
            a flex child's default min-width is its content size, which would
            block it from ever shrinking enough to scroll instead of overflow. */}
        <HStack
          spacing={0}
          overflowX="auto"
          minW={0}
          sx={{
            '&::-webkit-scrollbar': { display: 'none' },
            scrollbarWidth: 'none',
          }}
        >
          {tabs.map((tab) => {
            const isDisabled = tab.requiresAuth && !isLoggedIn;
            const isActive = activeFilter === tab.value;

            return (
              <Button
                key={tab.value}
                onClick={() => !isDisabled && onFilterChange(tab.value)}
                size="md"
                flexShrink={0}
                bg="transparent"
                color={isActive ? 'text' : 'overlay.500'}
                borderRadius="full"
                borderBottom="2px solid"
                borderColor={isActive ? 'primary' : 'transparent'}
                fontWeight={isActive ? 'bold' : 'medium'}
                px={4}
                py={3}
                _hover={{
                  bg: 'rgba(28, 161, 241, 0.08)',
                  color: isActive ? 'text' : 'overlay.700',
                  borderColor: isActive ? 'primary' : 'rgba(28, 161, 241, 0.3)',
                }}
                _active={{
                  bg: 'rgba(28, 161, 241, 0.12)',
                }}
                _disabled={{
                  opacity: 0.4,
                  cursor: 'not-allowed',
                  _hover: {
                    bg: 'transparent',
                    color: 'overlay.500',
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
        </HStack>
        <Spacer />
        <Box display={{ base: 'none', md: 'flex' }} alignItems="center" pr={3}>
          <HiveActivityWidget compact />
        </Box>
      </HStack>
    </Box>
  );
}
