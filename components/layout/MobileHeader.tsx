'use client';
import { Box, Flex, Text, Image, Icon, IconButton, Button } from '@chakra-ui/react';
import { FiBell } from 'react-icons/fi';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useLoginModal } from '@/contexts/LoginModalContext';
import { useHiveNotifications } from '@/hooks/useHiveNotifications';
import { usePathname } from 'next/navigation';
import { getHiveAvatarUrl } from '@/lib/utils/avatarUtils';
import NextLink from 'next/link';
import { CountBadge } from '@/components/ui/CountBadge';

interface MobileHeaderProps {
  onMePress: () => void;
}

export default function MobileHeader({ onMePress }: MobileHeaderProps) {
  const { username: user, isLoggedIn } = useCurrentUser();
  const { openLoginModal } = useLoginModal();
  const { unreadCount } = useHiveNotifications(user, { limit: 1, poll: false });
  const pathname = usePathname();

  // Immersive pages manage their own chrome
  if (pathname === '/shorts') return null;

  return (
    <Box
      as="header"
      position="fixed"
      top={0}
      left={0}
      right={0}
      h="56px"
      bg="rgba(8, 24, 40, 0.93)"
      borderBottom="1px solid rgba(102, 228, 255, 0.10)"
      backdropFilter="blur(20px)"
      display={{ base: 'flex', sm: 'none' }}
      alignItems="center"
      justifyContent="space-between"
      px={4}
      zIndex={998}
      boxShadow="0 2px 24px rgba(0,0,0,0.35)"
    >
      {/* Wordmark */}
      <Text
        fontSize="2xl"
        fontWeight="extrabold"
        letterSpacing="-0.04em"
        bgGradient="linear(to-r, #18a8ff, #66e4ff)"
        bgClip="text"
        userSelect="none"
      >
        snapie.io
      </Text>

      {/* Right: actions */}
      <Flex align="center" gap={1}>
        {isLoggedIn && user ? (
          <>
            {/* Notifications */}
            <Box position="relative">
              <IconButton
                as={NextLink}
                href={`/@${user}/notifications`}
                aria-label="Notifications"
                icon={<Icon as={FiBell} boxSize={5} />}
                variant="ghost"
                color={unreadCount > 0 ? 'red.300' : 'whiteAlpha.700'}
                size="sm"
                borderRadius="full"
                _hover={{ bg: 'whiteAlpha.100' }}
              />
              <CountBadge count={unreadCount} colorScheme="red" top="-2px" right="-2px" />
            </Box>

            {/* Avatar → opens MeSheet */}
            <Box
              as="button"
              onClick={onMePress}
              borderRadius="full"
              overflow="hidden"
              boxSize="34px"
              border="2px solid rgba(102, 228, 255, 0.35)"
              boxShadow="0 0 12px rgba(24, 168, 255, 0.2)"
              flexShrink={0}
              transition="box-shadow 0.15s"
              _hover={{ boxShadow: '0 0 16px rgba(24, 168, 255, 0.4)' }}
            >
              <Image src={getHiveAvatarUrl(user, 'small')} alt={user} w="full" h="full" objectFit="cover" />
            </Box>
          </>
        ) : (
          <Button
            size="sm"
            colorScheme="blue"
            borderRadius="full"
            px={4}
            onClick={openLoginModal}
          >
            Log in
          </Button>
        )}
      </Flex>
    </Box>
  );
}
