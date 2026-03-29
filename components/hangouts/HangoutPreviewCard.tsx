'use client';
import { Box, HStack, VStack, Text, Avatar, Badge } from '@chakra-ui/react';
import { useState, useEffect } from 'react';
import { HangoutsApiClient, type Room } from '@snapie/hangouts-react';
import { useHangout } from '@/contexts/HangoutContext';

interface HangoutPreviewCardProps {
  roomName: string;
}

export default function HangoutPreviewCard({ roomName }: HangoutPreviewCardProps) {
  const { openRoom } = useHangout();
  const [room, setRoom] = useState<Room | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setRoom(null);
    setError(null);
    const client = new HangoutsApiClient({
      baseUrl: process.env.NEXT_PUBLIC_HANGOUTS_API_URL!,
    });
    client.getRoom(roomName).then((found) => {
      setRoom(found);
      setLoading(false);
    }).catch(() => {
      setError('Failed to load hangout');
      setLoading(false);
    });
  }, [roomName]);

  if (loading) {
    return (
      <Box p={4} borderWidth="1px" borderColor="border" borderRadius="xl" bg="muted">
        <Text fontSize="sm" color="primary">Loading hangout...</Text>
      </Box>
    );
  }

  if (error) {
    return (
      <Box p={4} borderWidth="1px" borderColor="border" borderRadius="xl" bg="muted">
        <Text fontSize="sm" color="primary">{error}</Text>
      </Box>
    );
  }

  if (!room) {
    return (
      <Box p={4} borderWidth="1px" borderColor="border" borderRadius="xl" bg="muted">
        <Text fontSize="sm" color="primary">This hangout has ended</Text>
      </Box>
    );
  }

  return (
    <Box
      as="button"
      type="button"
      width="100%"
      textAlign="left"
      aria-label={`Join hangout: ${room.title}`}
      p={4}
      borderWidth="1px"
      borderColor="border"
      borderRadius="xl"
      bg="muted"
      onClick={() => openRoom(room.name)}
      _hover={{ borderColor: 'primary' }}
      _focus={{ outline: '2px solid', outlineColor: 'primary', outlineOffset: '2px' }}
      transition="border-color 0.15s"
    >
      <HStack spacing={3}>
        <Avatar
          size="md"
          name={room.host}
          src={`https://images.hive.blog/u/${room.host}/avatar/sm`}
        />
        <VStack align="start" spacing={0} flex={1}>
          <HStack>
            <Text fontWeight="bold" fontSize="md">{room.title}</Text>
            <Badge colorScheme="green" fontSize="xs">LIVE</Badge>
          </HStack>
          <Text fontSize="sm" color="primary">Hosted by @{room.host}</Text>
          {room.description && (
            <Text fontSize="sm" color="primary" noOfLines={2}>{room.description}</Text>
          )}
        </VStack>
        <VStack spacing={0}>
          <Text fontSize="lg" fontWeight="bold">{room.numParticipants ?? 0}</Text>
          <Text fontSize="xs" color="primary">listening</Text>
        </VStack>
      </HStack>
    </Box>
  );
}
