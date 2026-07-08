'use client';
import {
  Box, Flex, Text, HStack, VStack, Button, Spinner, Badge, Divider, useToast,
} from '@chakra-ui/react';
import { useState, useEffect, useCallback } from 'react';
import { HangoutsApiClient, type HangoutsEvent } from '@snapie/hangouts-core';
import { useHangout } from '@/contexts/HangoutContext';

const API_URL = process.env.NEXT_PUBLIC_HANGOUTS_API_URL;

interface MyEventsPanelProps {
  username: string;
  refreshKey?: number;
}

function formatEventDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export default function MyEventsPanel({ username, refreshKey = 0 }: MyEventsPanelProps) {
  const { openRoom, startEvent, cancelEvent } = useHangout();
  const toast = useToast();

  const [events, setEvents] = useState<HangoutsEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);

  const fetchMyEvents = useCallback(async () => {
    if (!API_URL || !username) return;
    setLoading(true);
    try {
      const client = new HangoutsApiClient({ baseUrl: API_URL });
      const all = await client.listEvents({ host: username, limit: 20 });
      setEvents(all.filter(e => e.status === 'scheduled' || e.status === 'live'));
    } catch {
      /* silent */
    } finally {
      setLoading(false);
    }
  }, [username]);

  useEffect(() => { fetchMyEvents(); }, [fetchMyEvents, refreshKey]);

  const handleGoLive = async (event: HangoutsEvent) => {
    setActionId(event.id);
    const res = await startEvent(event.id);
    setActionId(null);
    if (res) {
      openRoom(res.event.roomName!);
    } else {
      toast({ title: 'Could not start event', status: 'error', duration: 4000 });
    }
  };

  const handleCancel = async (event: HangoutsEvent) => {
    setActionId(event.id);
    await cancelEvent(event.id);
    setActionId(null);
    setEvents(prev => prev.filter(e => e.id !== event.id));
    toast({ title: 'Event cancelled', status: 'info', duration: 2500 });
  };

  if (loading) {
    return (
      <Flex justify="center" py={4}>
        <Spinner size="sm" color="primary" />
      </Flex>
    );
  }

  if (events.length === 0) return null;

  return (
    <Box mt={6}>
      <Divider borderColor="overlay.100" mb={4} />
      <Text fontSize="sm" fontWeight={700} color="text" mb={3}>
        Your Scheduled OpenPods
      </Text>
      <VStack spacing={3} align="stretch">
        {events.map((event) => {
          const isLive = event.status === 'live';
          const busy = actionId === event.id;
          return (
            <Box
              key={event.id}
              p={3}
              borderRadius="10px"
              borderWidth="1px"
              borderColor={isLive ? 'primary' : 'overlay.200'}
              bg="overlay.50"
            >
              <Flex justify="space-between" align="flex-start" gap={2}>
                <Box flex={1} minW={0}>
                  <HStack spacing={2} mb={0.5}>
                    {isLive && (
                      <Badge colorScheme="red" fontSize="9px" px={1}>LIVE</Badge>
                    )}
                    <Text fontSize="sm" fontWeight={600} color="text" noOfLines={1}>
                      {event.title}
                    </Text>
                  </HStack>
                  <Text fontSize="xs" color="overlay.500">
                    {isLive ? 'Started' : formatEventDate(event.scheduledAt)}
                    {event.attendeeCount > 0 && ` · ${event.attendeeCount} attending`}
                  </Text>
                </Box>
                <HStack spacing={2} flexShrink={0}>
                  {isLive ? (
                    <Button
                      size="xs"
                      colorScheme="red"
                      variant="outline"
                      isLoading={busy}
                      onClick={() => openRoom(event.roomName!)}
                    >
                      Rejoin
                    </Button>
                  ) : (
                    <Button
                      size="xs"
                      colorScheme="green"
                      isLoading={busy}
                      onClick={() => handleGoLive(event)}
                    >
                      Go Live
                    </Button>
                  )}
                  {!isLive && (
                    <Button
                      size="xs"
                      variant="ghost"
                      colorScheme="red"
                      isLoading={busy}
                      onClick={() => handleCancel(event)}
                    >
                      Cancel
                    </Button>
                  )}
                </HStack>
              </Flex>
            </Box>
          );
        })}
      </VStack>
    </Box>
  );
}
