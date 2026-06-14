'use client';
import { Box, Flex, Text, HStack, Image, Link as ChakraLink, Icon, Badge, IconButton, Tooltip } from '@chakra-ui/react';
import { FaCalendarAlt, FaCheck, FaPlus } from 'react-icons/fa';
import NextLink from 'next/link';
import { useState } from 'react';
import { useUpcomingEvents } from '@/hooks/useUpcomingEvents';
import { useHangout } from '@/contexts/HangoutContext';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import type { HangoutsEvent } from '@snapie/hangouts-core';

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

function EventCard({ event }: { event: HangoutsEvent }) {
  const { openRoom, attendEvent, unattendEvent } = useHangout();
  const { username: user } = useCurrentUser();
  const isLive = event.status === 'live';

  const [attending, setAttending] = useState(() => !!user && event.attendees.includes(user));
  const [count, setCount] = useState(event.attendeeCount);
  const [rsvpLoading, setRsvpLoading] = useState(false);

  const handleClick = () => {
    if (isLive && event.roomName) openRoom(event.roomName);
  };

  const handleRsvp = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user || rsvpLoading) return;
    setRsvpLoading(true);
    const prev = attending;
    setAttending(!prev);
    setCount(c => prev ? c - 1 : c + 1);
    const res = prev
      ? await unattendEvent(event.id)
      : await attendEvent(event.id);
    if (res) {
      setCount(res.attendeeCount);
    } else {
      setAttending(prev);
      setCount(event.attendeeCount);
    }
    setRsvpLoading(false);
  };

  return (
    <Box
      as={isLive ? 'button' : 'div'}
      onClick={isLive ? handleClick : undefined}
      aria-label={isLive ? `Join live: ${event.title}` : undefined}
      display="flex"
      alignItems="center"
      gap={2.5}
      bg="rgba(255, 255, 255, 0.05)"
      borderWidth="1px"
      borderColor={isLive ? 'primary' : 'rgba(255, 255, 255, 0.08)'}
      borderRadius="10px"
      px={3}
      py={2}
      flexShrink={0}
      maxW="250px"
      textAlign="left"
      transition="border-color 0.15s, background 0.15s"
      cursor={isLive ? 'pointer' : 'default'}
      _hover={isLive ? { borderColor: 'primary', bg: 'rgba(229, 57, 53, 0.06)' } : {}}
    >
      <Image
        src={event.coverImage || `https://images.hive.blog/u/${event.hostUsername}/avatar/sm`}
        alt={event.hostUsername}
        boxSize="34px"
        borderRadius="full"
        objectFit="cover"
        bg="rgba(255, 255, 255, 0.1)"
        flexShrink={0}
        fallback={<Box boxSize="34px" borderRadius="full" bg="rgba(255, 255, 255, 0.1)" flexShrink={0} />}
      />
      <Flex direction="column" minW={0} flex={1}>
        <HStack spacing={1} mb="1px">
          {isLive && (
            <Badge colorScheme="red" fontSize="9px" px={1} py={0} lineHeight="1.4" borderRadius="3px">
              LIVE
            </Badge>
          )}
          <Text fontSize="13px" fontWeight={600} color="text" noOfLines={1}>
            {event.title}
          </Text>
        </HStack>
        <Text fontSize="11px" color="rgba(255,255,255,0.55)" noOfLines={1}>
          @{event.hostUsername}
          {!isLive && (
            <Text as="span" color="primary"> · {formatEventDate(event.scheduledAt)}</Text>
          )}
        </Text>
      </Flex>

      <Flex direction="column" alignItems="center" flexShrink={0} pl={1} gap={0.5}>
        {user && !isLive && (
          <Tooltip label={attending ? 'Remove RSVP' : 'RSVP'} placement="top" hasArrow>
            <IconButton
              aria-label={attending ? 'Remove RSVP' : 'RSVP'}
              icon={attending ? <FaCheck /> : <FaPlus />}
              size="xs"
              variant="ghost"
              colorScheme={attending ? 'green' : 'whiteAlpha'}
              color={attending ? 'green.400' : 'rgba(255,255,255,0.4)'}
              isLoading={rsvpLoading}
              onClick={handleRsvp}
              _hover={{ color: attending ? 'green.300' : 'white' }}
            />
          </Tooltip>
        )}
        {count > 0 && (
          <Text fontSize="10px" color="rgba(255,255,255,0.45)">{count}</Text>
        )}
      </Flex>
    </Box>
  );
}

export default function UpcomingEventsStrip() {
  const events = useUpcomingEvents();

  if (events.length === 0) return null;

  return (
    <Box mb={4} px={1}>
      <Flex align="center" gap={2} mb={2}>
        <Icon as={FaCalendarAlt} color="primary" boxSize="15px" flexShrink={0} />
        <Text fontSize="sm" fontWeight={600} color="text" flex={1}>
          Upcoming OpenPods
        </Text>
        <ChakraLink as={NextLink} href="/hangouts" fontSize="xs" color="primary" whiteSpace="nowrap" _hover={{ textDecoration: 'underline' }}>
          View all
        </ChakraLink>
      </Flex>

      <HStack
        spacing={2.5}
        overflowX="auto"
        pb={1}
        sx={{
          scrollbarWidth: 'none',
          '&::-webkit-scrollbar': { display: 'none' },
        }}
      >
        {events.map((event) => (
          <EventCard key={event.id} event={event} />
        ))}
      </HStack>
    </Box>
  );
}
