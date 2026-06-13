'use client';
import {
  Drawer, DrawerOverlay, DrawerContent, DrawerBody,
  Flex, Box, Text, Image, Icon, Button, VStack, Divider, Badge,
} from '@chakra-ui/react';
import {
  FiUser, FiCreditCard, FiBell, FiRadio, FiMessageSquare,
  FiLogIn, FiUserPlus, FiLogOut, FiInfo,
} from 'react-icons/fi';
import NextLink from 'next/link';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useLoginModal } from '@/contexts/LoginModalContext';
import { useHiveNotifications } from '@/hooks/useHiveNotifications';
import { useOpenPodsCount } from '@/hooks/useOpenPodsCount';
import { getHiveAvatarUrl } from '@/lib/utils/avatarUtils';
import HiveActivityWidget from './HiveActivityWidget';

interface MeSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onToggleChat: () => void;
  chatUnreadCount: number;
}

export default function MeSheet({ isOpen, onClose, onToggleChat, chatUnreadCount }: MeSheetProps) {
  const { username: user, isLoggedIn, logout } = useCurrentUser();
  const { openLoginModal } = useLoginModal();
  const { unreadCount } = useHiveNotifications(user, { limit: 1, poll: false });
  const openPodsCount = useOpenPodsCount();

  return (
    <Drawer isOpen={isOpen} onClose={onClose} placement="bottom">
      <DrawerOverlay bg="blackAlpha.600" backdropFilter="blur(6px)" />
      <DrawerContent
        bg="rgba(7, 20, 36, 0.98)"
        borderTopRadius="24px"
        backdropFilter="blur(24px)"
        border="1px solid rgba(102, 228, 255, 0.12)"
        maxH="82dvh"
      >
        <DrawerBody p={0} overflowY="auto">
          {/* Drag handle */}
          <Flex justify="center" pt={3} pb={2} flexShrink={0}>
            <Box w="36px" h="4px" borderRadius="full" bg="whiteAlpha.300" />
          </Flex>

          {isLoggedIn && user ? (
            <>
              {/* Identity card */}
              <Flex align="center" gap={3} px={5} pt={2} pb={4}>
                <Image
                  src={getHiveAvatarUrl(user, 'medium')}
                  alt={user}
                  boxSize="60px"
                  borderRadius="full"
                  border="2px solid rgba(102, 228, 255, 0.4)"
                  boxShadow="0 0 20px rgba(24, 168, 255, 0.22)"
                  flexShrink={0}
                />
                <Box overflow="hidden">
                  <Text color="white" fontWeight="bold" fontSize="lg" noOfLines={1}>
                    @{user}
                  </Text>
                  <Text color="whiteAlpha.500" fontSize="xs">Logged in</Text>
                </Box>
              </Flex>

              <Divider borderColor="rgba(102, 228, 255, 0.08)" />

              {/* Navigation links */}
              <VStack spacing={0} py={2}>
                <SheetLink href={`/@${user}`}           icon={FiUser}         label="My Profile"     onClose={onClose} />
                <SheetLink href={`/@${user}/wallet`}    icon={FiCreditCard}   label="Wallet"         onClose={onClose} />
                <SheetLink href={`/@${user}/notifications`} icon={FiBell}     label="Notifications"  badge={unreadCount} onClose={onClose} />
                <SheetLink href="/hangouts"              icon={FiRadio}        label="OpenPods"       badge={openPodsCount} onClose={onClose} />
                <SheetButton
                  icon={FiMessageSquare}
                  label="Chat"
                  badge={chatUnreadCount}
                  onClick={() => { onClose(); onToggleChat(); }}
                />
                <SheetLink href="https://about.snapie.io" icon={FiInfo} label="About Snapie" external onClose={onClose} />
              </VStack>

              <Divider borderColor="rgba(102, 228, 255, 0.08)" />

              {/* Hive activity indicator */}
              <Box px={2} pb={1}>
                <HiveActivityWidget />
              </Box>

              {/* Logout */}
              <Box px={4} py={4}>
                <Button
                  w="full"
                  variant="ghost"
                  color="red.400"
                  leftIcon={<Icon as={FiLogOut} />}
                  borderRadius="12px"
                  _hover={{ bg: 'rgba(255, 80, 80, 0.08)' }}
                  onClick={() => { logout(); onClose(); }}
                >
                  Log out
                </Button>
              </Box>
            </>
          ) : (
            /* Not logged in */
            <Box px={5} py={6}>
              <Text color="white" fontWeight="bold" fontSize="lg" mb={1}>
                Welcome to Snapie
              </Text>
              <Text color="whiteAlpha.500" fontSize="sm" mb={6}>
                Log in to post, vote, and connect with the community.
              </Text>
              <VStack spacing={3}>
                <Button
                  w="full"
                  colorScheme="blue"
                  borderRadius="12px"
                  leftIcon={<Icon as={FiLogIn} />}
                  onClick={() => { openLoginModal(); onClose(); }}
                >
                  Log in
                </Button>
                <Button
                  w="full"
                  variant="outline"
                  color="white"
                  borderColor="rgba(102, 228, 255, 0.25)"
                  borderRadius="12px"
                  leftIcon={<Icon as={FiUserPlus} />}
                  as={NextLink}
                  href="/join"
                  onClick={onClose}
                >
                  Create account
                </Button>
              </VStack>
            </Box>
          )}
        </DrawerBody>
      </DrawerContent>
    </Drawer>
  );
}

// ─── Row helpers ─────────────────────────────────────────────────────────────

interface SheetLinkProps {
  href: string;
  icon: React.ElementType;
  label: string;
  badge?: number;
  external?: boolean;
  onClose: () => void;
}

function SheetLink({ href, icon, label, badge = 0, external, onClose }: SheetLinkProps) {
  return (
    <Flex
      as={external ? 'a' : NextLink}
      href={href}
      target={external ? '_blank' : undefined}
      rel={external ? 'noopener noreferrer' : undefined}
      align="center"
      gap={3}
      px={5}
      py={3}
      w="full"
      cursor="pointer"
      color="white"
      _hover={{ bg: 'whiteAlpha.50' }}
      transition="background 0.12s"
      onClick={onClose}
    >
      <Icon as={icon} boxSize={5} color="whiteAlpha.600" />
      <Text fontSize="sm" flex={1}>{label}</Text>
      {badge > 0 && <Badge colorScheme="red" borderRadius="full" fontSize="xs" px={2}>{badge}</Badge>}
    </Flex>
  );
}

interface SheetButtonProps {
  icon: React.ElementType;
  label: string;
  badge?: number;
  onClick: () => void;
}

function SheetButton({ icon, label, badge = 0, onClick }: SheetButtonProps) {
  return (
    <Flex
      align="center"
      gap={3}
      px={5}
      py={3}
      w="full"
      cursor="pointer"
      color="white"
      _hover={{ bg: 'whiteAlpha.50' }}
      transition="background 0.12s"
      onClick={onClick}
    >
      <Icon as={icon} boxSize={5} color="whiteAlpha.600" />
      <Text fontSize="sm" flex={1}>{label}</Text>
      {badge > 0 && <Badge colorScheme="red" borderRadius="full" fontSize="xs" px={2}>{badge}</Badge>}
    </Flex>
  );
}
