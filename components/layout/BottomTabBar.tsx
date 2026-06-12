'use client';
import { Box, Flex, Text, Image, Icon } from '@chakra-ui/react';
import { FiHome, FiBook, FiPlay, FiUser, FiPlus } from 'react-icons/fi';
import NextLink from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { getHiveAvatarUrl } from '@/lib/utils/avatarUtils';

interface BottomTabBarProps {
  onMePress: () => void;
}

export default function BottomTabBar({ onMePress }: BottomTabBarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { username: user } = useCurrentUser();

  function handleComposeTap() {
    if (pathname === '/') {
      document.getElementById('scrollableDiv')?.scrollTo({ top: 0, behavior: 'smooth' });
      setTimeout(() => {
        const ta = document.querySelector<HTMLTextAreaElement>('#snap-composer textarea');
        ta?.focus();
      }, 300);
    } else {
      router.push('/?focus=composer');
    }
  }

  // Hide on immersive pages
  if (pathname === '/shorts') return null;

  const isActive = (path: string) =>
    path === '/' ? pathname === '/' : pathname.startsWith(path);

  return (
    <Box
      as="nav"
      position="fixed"
      bottom={0}
      left={0}
      right={0}
      h="60px"
      bg="rgba(8, 24, 40, 0.95)"
      borderTop="1px solid rgba(102, 228, 255, 0.14)"
      backdropFilter="blur(20px)"
      display={{ base: 'flex', sm: 'none' }}
      alignItems="center"
      zIndex={999}
      boxShadow="0 -4px 24px rgba(0,0,0,0.4)"
    >
      <Flex w="full" h="full" align="center">
        {/* Home */}
        <Tab href="/" icon={FiHome} label="Home" active={isActive('/')} />

        {/* Blog */}
        <Tab href="/blog" icon={FiBook} label="Blog" active={isActive('/blog')} />

        {/* Compose — elevated center CTA */}
        <Flex flex={1} justify="center" align="center">
          <Box
            as="button"
            onClick={handleComposeTap}
            display="flex"
            alignItems="center"
            justifyContent="center"
            w="50px"
            h="50px"
            borderRadius="full"
            bgGradient="linear(135deg, #18a8ff, #66e4ff)"
            boxShadow="0 4px 22px rgba(24, 168, 255, 0.55)"
            color="white"
            mb="10px"
            transition="transform 0.15s, box-shadow 0.15s"
            _hover={{ transform: 'scale(1.08)', boxShadow: '0 6px 28px rgba(24, 168, 255, 0.7)' }}
            _active={{ transform: 'scale(0.94)' }}
          >
            <Icon as={FiPlus} boxSize={6} strokeWidth={2.5} />
          </Box>
        </Flex>

        {/* Shorts */}
        <Tab href="/shorts" icon={FiPlay} label="Shorts" active={isActive('/shorts')} />

        {/* Me — opens MeSheet, not a page link */}
        <Flex
          flex={1}
          direction="column"
          align="center"
          justify="center"
          h="full"
          cursor="pointer"
          onClick={onMePress}
          color="white"
          opacity={0.65}
          transition="opacity 0.15s"
          _hover={{ opacity: 1 }}
          gap="2px"
        >
          {user ? (
            <Image
              src={getHiveAvatarUrl(user, 'small')}
              alt={user}
              boxSize="26px"
              borderRadius="full"
              border="2px solid rgba(102, 228, 255, 0.45)"
            />
          ) : (
            <Icon as={FiUser} boxSize={5} />
          )}
          <Text fontSize="9px" letterSpacing="0.02em">Me</Text>
        </Flex>
      </Flex>
    </Box>
  );
}

// ─── Tab item ─────────────────────────────────────────────────────────────────

interface TabProps {
  href: string;
  icon: React.ElementType;
  label: string;
  active: boolean;
}

function Tab({ href, icon, label, active }: TabProps) {
  return (
    <Flex
      as={NextLink}
      href={href}
      flex={1}
      direction="column"
      align="center"
      justify="center"
      h="full"
      color={active ? 'cyan.300' : 'white'}
      opacity={active ? 1 : 0.55}
      transition="opacity 0.15s, color 0.15s"
      _hover={{ opacity: 1 }}
      gap="2px"
    >
      <Icon as={icon} boxSize={5} />
      <Text fontSize="9px" letterSpacing="0.02em">{label}</Text>
    </Flex>
  );
}
