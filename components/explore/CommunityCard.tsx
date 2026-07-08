'use client';
import { Box, Flex, Text, Image, Badge } from '@chakra-ui/react';
import NextLink from 'next/link';
import { getHiveAvatarUrl } from '@/lib/utils/avatarUtils';

interface CommunityCardProps {
  tag: string;
  title: string;
  about: string;
  subscribers: number;
  topPosts: number;
  totalPayouts: string;
}

export default function CommunityCard({ tag, title, about, subscribers, topPosts, totalPayouts }: CommunityCardProps) {
  const payoutNum = parseFloat(totalPayouts) || 0;

  return (
    <Box
      as={NextLink}
      href={`/explore/${encodeURIComponent(tag)}`}
      display="block"
      bg="surface"
      border="tb1"
      borderRadius="12px"
      backdropFilter="blur(18px)"
      p={4}
      _hover={{
        bg: 'rgba(28, 161, 241, 0.08)',
        borderColor: 'rgba(28, 161, 241, 0.25)',
        textDecoration: 'none',
        transform: 'translateY(-1px)',
      }}
      transition="all 0.15s"
      cursor="pointer"
    >
      <Flex gap={3} align="flex-start">
        <Image
          src={getHiveAvatarUrl(tag, 'medium')}
          alt={title}
          boxSize="48px"
          borderRadius="full"
          border="1px solid rgba(28, 161, 241, 0.2)"
          flexShrink={0}
        />
        <Box flex={1} minW={0}>
          <Flex align="center" justify="space-between" gap={2} mb={1}>
            <Text fontWeight="bold" fontSize="sm" color="text" noOfLines={1} flex={1}>
              {title}
            </Text>
            <Badge
              colorScheme="green"
              variant="subtle"
              fontSize="xs"
              borderRadius="full"
              px={2}
              flexShrink={0}
            >
              ${payoutNum.toFixed(0)} HBD
            </Badge>
          </Flex>
          {about && (
            <Text fontSize="xs" color="overlay.600" noOfLines={2} mb={2} lineHeight="short">
              {about}
            </Text>
          )}
          <Flex gap={4}>
            <Text fontSize="xs" color="overlay.400">
              <Text as="span" color="overlay.700" fontWeight="semibold">
                {subscribers?.toLocaleString()}
              </Text>{' '}
              subscribers
            </Text>
            <Text fontSize="xs" color="overlay.400">
              <Text as="span" color="overlay.700" fontWeight="semibold">
                {topPosts?.toLocaleString()}
              </Text>{' '}
              posts
            </Text>
          </Flex>
        </Box>
      </Flex>
    </Box>
  );
}
