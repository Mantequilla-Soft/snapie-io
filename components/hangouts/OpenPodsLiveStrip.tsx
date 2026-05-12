'use client';
import { Box, Flex, Text, HStack, Image, Link as ChakraLink, Icon } from '@chakra-ui/react';
import { keyframes } from '@emotion/react';
import { FaMicrophone } from 'react-icons/fa';
import NextLink from 'next/link';
import { useHangout } from '@/contexts/HangoutContext';
import { useLiveOpenPods } from '@/hooks/useOpenPodsCount';

const micPulse = keyframes`
  0%, 100% { opacity: 1; }
  50%      { opacity: 0.55; }
`;

export default function OpenPodsLiveStrip() {
  const rooms = useLiveOpenPods();
  const { openRoom } = useHangout();

  if (rooms.length === 0) return null;

  return (
    <Box mb={4} px={1}>
      <Flex align="center" gap={2} mb={2}>
        <Icon as={FaMicrophone} color="primary" boxSize="18px" animation={`${micPulse} 2s ease-in-out infinite`} flexShrink={0} />
        <Text fontSize="sm" fontWeight={600} color="text" flex={1}>
          <Text as="span" color="primary">{rooms.length}</Text>
          {' '}OpenPod{rooms.length !== 1 ? 's' : ''} live now
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
        {rooms.map((room) => (
          <Box
            as="button"
            key={room.name}
            onClick={() => openRoom(room.name)}
            aria-label={`Join OpenPod: ${room.title}`}
            display="flex"
            alignItems="center"
            gap={2.5}
            bg="rgba(255, 255, 255, 0.05)"
            borderWidth="1px"
            borderColor="rgba(255, 255, 255, 0.08)"
            borderRadius="10px"
            px={3}
            py={2}
            cursor="pointer"
            flexShrink={0}
            maxW="220px"
            textAlign="left"
            transition="border-color 0.15s, background 0.15s"
            _hover={{
              borderColor: 'primary',
              bg: 'rgba(229, 57, 53, 0.06)',
            }}
          >
            <Image
              src={`https://images.hive.blog/u/${room.host}/avatar/sm`}
              alt={room.host}
              boxSize="34px"
              borderRadius="full"
              objectFit="cover"
              bg="rgba(255, 255, 255, 0.1)"
              flexShrink={0}
              fallback={<Box boxSize="34px" borderRadius="full" bg="rgba(255, 255, 255, 0.1)" flexShrink={0} />}
            />
            <Flex direction="column" minW={0}>
              <Text fontSize="13px" fontWeight={600} color="text" noOfLines={1} maxW="130px">
                {room.title}
              </Text>
              <Text fontSize="11px" color="rgba(255,255,255,0.55)">
                @{room.host}
              </Text>
            </Flex>
            {!!room.numParticipants && room.numParticipants > 0 && (
              <Text fontSize="11px" color="rgba(255,255,255,0.55)" ml="auto" flexShrink={0} pl={2}>
                {room.numParticipants}
              </Text>
            )}
          </Box>
        ))}
      </HStack>
    </Box>
  );
}
