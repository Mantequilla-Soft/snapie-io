'use client';
import { Box, Heading, SimpleGrid, Text, VStack, Card, CardBody, Button, Flex, Image } from '@chakra-ui/react';
import NextLink from 'next/link';
import { FiArrowRight } from 'react-icons/fi';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useLoginModal } from '@/contexts/LoginModalContext';
import { GAMES_FEATURE_FLAG } from '@/lib/points/config';
import snapieVictory from '@/components/games/puff-quest/assets/snapie-victory.png';
import snapieBlastCard from '@/components/games/snapie-blast/assets/snapie-blast-card.png';
import type { GameId } from '@/lib/games/config';

const GAMES_CATALOG: {
  id: GameId;
  name: string;
  tagline: string;
  href: string;
  image: { src: string };
  // 'cover' suits a photographic hero image; 'contain' keeps a pixel-art icon
  // fully visible instead of letting a wide/short card crop into it.
  imageFit: 'cover' | 'contain';
}[] = [
  {
    id: 'puff-quest',
    name: 'Snapie Quest',
    tagline: 'Inhale enemies, steal their powers, clear the keep.',
    href: '/games/puff-quest',
    image: snapieVictory,
    imageFit: 'cover',
  },
  {
    id: 'snapie-blast',
    name: 'Snapie Blast',
    tagline: 'Blast the swarm in this 8-bit shooting gallery. 60 seconds, 3 lives.',
    href: '/games/snapie-blast',
    image: snapieBlastCard,
    imageFit: 'contain',
  },
];

export default function GamesPage() {
  const { isLoggedIn } = useCurrentUser();
  const { openLoginModal } = useLoginModal();

  if (!GAMES_FEATURE_FLAG) {
    return (
      <Box p={8} textAlign="center">
        <Heading>Games</Heading>
        <Text mt={4} color="fg.muted">
          Coming soon
        </Text>
      </Box>
    );
  }

  if (!isLoggedIn) {
    return (
      <Box p={8} textAlign="center">
        <Heading>Games</Heading>
        <Text mt={4} color="fg.muted">
          Please log in to play
        </Text>
        <Button mt={6} onClick={openLoginModal}>
          Log In
        </Button>
      </Box>
    );
  }

  return (
    <Box p={8} maxW="1200px" mx="auto">
      <VStack align="stretch" spacing={8}>
        <Box>
          <Heading size="lg">Games</Heading>
          <Text mt={2} color="fg.muted">
            Play games and earn Snapie Points
          </Text>
        </Box>

        <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} spacing={6}>
          {GAMES_CATALOG.map(game => (
            <Card key={game.id} as={NextLink} href={game.href} _hover={{ shadow: 'lg' }} transition="all 0.2s" overflow="hidden">
              <CardBody p={0}>
                <VStack align="stretch" spacing={0} h="full">
                  <Flex justify="center" align="center" h={40} bg="rgba(26,28,44,0.5)" borderRadius="0" position="relative">
                    <Image
                      src={game.image.src}
                      alt={game.name}
                      objectFit={game.imageFit}
                      w="full"
                      h="full"
                      opacity={0.7}
                      style={{ imageRendering: 'pixelated' }}
                    />
                  </Flex>
                  <Box p={4}>
                    <VStack align="stretch" spacing={2}>
                      <Heading size="md">{game.name}</Heading>
                      <Text fontSize="sm" color="fg.muted">
                        {game.tagline}
                      </Text>
                    </VStack>
                  </Box>
                  <Box px={4} pb={4}>
                    <Button w="full" rightIcon={<FiArrowRight />} colorScheme="orange" size="sm">
                      Play
                    </Button>
                  </Box>
                </VStack>
              </CardBody>
            </Card>
          ))}
        </SimpleGrid>
      </VStack>
    </Box>
  );
}
