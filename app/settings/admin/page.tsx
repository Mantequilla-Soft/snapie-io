'use client';
import { Box, Flex, Text, Icon, Divider, Link as ChakraLink, Spinner } from '@chakra-ui/react';
import NextLink from 'next/link';
import { FiArrowLeft, FiChevronRight, FiGift, FiPackage, FiShield, FiTool } from 'react-icons/fi';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useIsAdmin } from '@/hooks/useIsAdmin';

interface AdminToolRow {
  href: string;
  icon: typeof FiGift;
  label: string;
  description: string;
}

const TOOLS: AdminToolRow[] = [
  { href: '/settings/admin/grant-points', icon: FiGift, label: 'Grant Points', description: "Manually credit a user's spendable balance." },
  { href: '/settings/admin/market', icon: FiPackage, label: 'The Pile — Review Queue', description: 'Approve or reject items submitted for the market.' },
  { href: '/settings/admin/mute-account', icon: FiShield, label: 'Mute / Unmute Account', description: 'Real on-chain community mute — visible to everyone, everywhere.' },
  { href: '/settings/admin/heal-purchase', icon: FiTool, label: 'Heal Purchase', description: 'Recover a stuck points purchase by transaction id.' },
];

export default function AdminDashboardPage() {
  const { isLoggedIn } = useCurrentUser();
  const { isAdmin, loading } = useIsAdmin();

  return (
    <Box maxW="640px" mx="auto" px={{ base: 4, md: 8 }} py={10}>
      <ChakraLink as={NextLink} href="/settings" display="inline-flex" alignItems="center" gap={1} color="overlay.500" fontSize="sm" mb={4} _hover={{ color: 'text' }}>
        <FiArrowLeft /> Settings
      </ChakraLink>

      <Text fontSize="lg" fontWeight="bold" color="text" mb={1}>Admin Dashboard</Text>
      <Text color="overlay.500" fontSize="sm" mb={6}>
        Everything administrative, in one place. Every action here is server-enforced against the admin allowlist — this page is just the front door.
      </Text>

      {!isLoggedIn ? (
        <Text color="overlay.500">Log in first.</Text>
      ) : loading ? (
        <Box textAlign="center" py={8}><Spinner color="primary" /></Box>
      ) : !isAdmin ? (
        <Text color="red.400">Access denied.</Text>
      ) : (
        <Box bg="surface" borderRadius="16px" border="1px solid" borderColor="surfaceBorder" overflow="hidden">
          {TOOLS.map((tool, i) => (
            <Box key={tool.href}>
              {i > 0 && <Divider borderColor="surfaceBorder" />}
              <Flex
                as={NextLink}
                href={tool.href}
                align="center"
                gap={4}
                px={6}
                py={5}
                cursor="pointer"
                transition="all 0.15s"
                _hover={{ bg: 'rgba(28, 161, 241, 0.06)' }}
              >
                <Flex flexShrink={0} w="36px" h="36px" borderRadius="10px" bg="rgba(28, 161, 241, 0.15)" align="center" justify="center">
                  <Icon as={tool.icon} boxSize={4} color="primary" />
                </Flex>
                <Box flex={1}>
                  <Text color="text" fontWeight="medium" fontSize="sm" mb={1}>{tool.label}</Text>
                  <Text color="overlay.500" fontSize="xs">{tool.description}</Text>
                </Box>
                <Icon as={FiChevronRight} boxSize={5} color="overlay.400" flexShrink={0} />
              </Flex>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}
