'use client';
import { Box, Flex, Text, HStack, Image, Link as ChakraLink, Icon, Badge } from '@chakra-ui/react';
import { FaCalendarAlt } from 'react-icons/fa';
import NextLink from 'next/link';
import { useUpcomingEvents } from '@/hooks/useUpcomingEvents';
import { useHangout } from '@/contexts/HangoutContext';

function formatEventDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = d.getTime() - now.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);

  if (diffHours < 0) return 'Soon';
  if (diffHours < 1) return `in ${Math.round(diffHours * 60)}m`;
  if (diffHours < 24) return `in ${Math.round(diffHours)}h`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function SidebarEventsWidget() {
  const allEvents = useUpcomingEvents();
  const { openRoom } = useHangout();

  const events = [...allEvents]
    .sort((a, b) => {
      if (a.status === 'live' && b.status !== 'live') return -1;
      if (b.status === 'live' && a.status !== 'live') return 1;
      return new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime();
    })
    .slice(0, 3);

  if (events.length === 0) return null;

  return (
    <Box px={2} mb={4}>
      <Flex align="center" justify="space-between" px={2} pt={2} pb={3}>
        <HStack spacing={1.5}>
          <Icon as={FaCalendarAlt} color="whiteAlpha.500" boxSize="11px" />
          <Text fontSize="xs" fontWeight="bold" color="whiteAlpha.400" letterSpacing="widest" textTransform="uppercase">
            Upcoming OpenPods
          </Text>
        </HStack>
        <ChakraLink as={NextLink} href="/hangouts" fontSize="xs" color="whiteAlpha.400" _hover={{ color: 'whiteAlpha.700' }}>
          All
        </ChakraLink>
      </Flex>

      <Flex direction="column" gap={1}>
        {events.map((event) => {
          const isLive = event.status === 'live';
          return (
            <Box
              key={event.id}
              as={isLive ? 'button' : 'div'}
              onClick={isLive && event.roomName ? () => openRoom(event.roomName!) : undefined}
              display="flex"
              alignItems="center"
              gap={2.5}
              px={2}
              py={1.5}
              borderRadius="8px"
              cursor={isLive ? 'pointer' : 'default'}
              transition="background 0.15s"
              _hover={isLive ? { bg: 'rgba(255,255,255,0.05)' } : {}}
              w="100%"
              textAlign="left"
            >
              <Image
                src={event.coverImage || `https://images.hive.blog/u/${event.hostUsername}/avatar/sm`}
                alt={event.hostUsername}
                boxSize="28px"
                borderRadius="full"
                objectFit="cover"
                flexShrink={0}
                fallback={<Box boxSize="28px" borderRadius="full" bg="rgba(255,255,255,0.1)" flexShrink={0} />}
              />
              <Box flex={1} minW={0}>
                <HStack spacing={1}>
                  {isLive && (
                    <Badge colorScheme="red" fontSize="8px" px={1} py={0} lineHeight="1.4" borderRadius="2px" flexShrink={0}>
                      LIVE
                    </Badge>
                  )}
                  <Text fontSize="12px" fontWeight={600} color="white" noOfLines={1}>
                    {event.title}
                  </Text>
                </HStack>
                <Text fontSize="11px" color="whiteAlpha.500" noOfLines={1}>
                  @{event.hostUsername}
                </Text>
              </Box>
              <Text fontSize="11px" color="whiteAlpha.400" flexShrink={0} pl={1}>
                {isLive ? (
                  <Text as="span" color="red.400" fontWeight={600}>●</Text>
                ) : (
                  formatEventDate(event.scheduledAt)
                )}
              </Text>
            </Box>
          );
        })}
      </Flex>
    </Box>
  );
}
