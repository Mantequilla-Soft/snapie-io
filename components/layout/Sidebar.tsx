'use client';
import React, { useEffect, useState } from 'react';
import { Box, VStack, Button, Icon, Image, Spinner, Flex, Text, Tooltip, useBreakpointValue, useToast } from '@chakra-ui/react';
import { CountBadge } from '@/components/ui/CountBadge';
import { usePathname } from 'next/navigation';
import NextLink from 'next/link';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useLoginModal } from '@/contexts/LoginModalContext';
import { FiHome, FiBell, FiBook, FiCreditCard, FiLogIn, FiLogOut, FiMessageSquare, FiRadio, FiInfo, FiUserPlus, FiPlay, FiCompass, FiHeart, FiSettings, FiAward } from 'react-icons/fi';
import { POINTS_FEATURE_FLAG } from '@/lib/points/config';
import { getCommunityInfo, getProfile } from '@/lib/hive/client-functions';
import { motion } from 'framer-motion';
import { getHiveAvatarUrl } from '@/lib/utils/avatarUtils';
import { Avatar } from '@/components/shared/Avatar';
import { useOpenPodsCount } from '@/hooks/useOpenPodsCount';
import { useNotifications } from '@/contexts/NotificationContext';
import { useUnclaimedRewards } from '@/hooks/useUnclaimedRewards';

interface ProfileInfo {
    metadata: {
        profile: {
            profile_image: string;
        };
    };
}

interface CommunityInfo {
    title: string;
    about: string;
}

const communityTag = process.env.NEXT_PUBLIC_HIVE_COMMUNITY_TAG;

interface SidebarProps {
    isChatOpen?: boolean;
    setIsChatOpen?: (v: boolean) => void;
    chatUnreadCount?: number;
}

export default function Sidebar({ isChatOpen = false, setIsChatOpen, chatUnreadCount = 0 }: SidebarProps) {
    const { username: user, isLoggedIn, logout } = useCurrentUser();
    const { openLoginModal } = useLoginModal();
    const pathname = usePathname();
    const [communityInfo, setCommunityInfo] = useState<CommunityInfo | null>(null);
    const [profileInfo, setProfileInfo] = useState<ProfileInfo | null>(null);
    const [loading, setLoading] = useState(true);
    const toast = useToast();
    const openPodsCount = useOpenPodsCount();
    const { unreadCount } = useNotifications();
    const hasUnclaimed = useUnclaimedRewards();

    function handleHomeClick(e: React.MouseEvent) {
        if (pathname === '/') {
            e.preventDefault();
            window.dispatchEvent(new CustomEvent('snapie:go-home'));
        }
    }

    const forceCompact = pathname === '/compose';
    const compactBreakpoint = forceCompact ? 'block' : { sm: 'block', md: 'none' };
    const fullBreakpoint = forceCompact ? 'none' : { sm: 'none', md: 'flex' };
    const textDisplay = forceCompact ? 'none' : { sm: 'none', md: 'block' };
    const iconJustify = forceCompact ? 'center' : { sm: 'center', md: 'flex-start' };

    const isCompactMode = useBreakpointValue({ base: false, sm: true, md: false }) || forceCompact;

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            if (communityTag) {
                try {
                    const communityData = await getCommunityInfo(communityTag);
                    sessionStorage.setItem('communityData', JSON.stringify(communityData));
                    setCommunityInfo(communityData);

                    const profileData = await getProfile(communityTag);
                    sessionStorage.setItem('profileData', JSON.stringify(profileData));
                    setProfileInfo(profileData);
                } catch (error) {
                    console.error('Failed to fetch data', error);
                } finally {
                    setLoading(false);
                }
            }
        };

        fetchData();
    }, []);

    return (
        <Box
            as="nav"
            bg="surface"
            p={3}
            w={forceCompact ? '72px' : { base: 'full', sm: '72px', md: '260px' }}
            h="100vh"
            overflowY="auto"
            position={{ base: 'relative', sm: 'sticky' }}
            top={0}
            mt={0}
            alignSelf={{ base: 'auto', sm: 'flex-start' }}
            display={{ base: 'none', sm: 'block' }}
            transition="width 0.3s ease"
            borderRight="1px solid"
            borderRightColor="surfaceBorder"
            borderRadius={0}
            backdropFilter="blur(18px)"
            sx={{
                '&::-webkit-scrollbar': {
                    display: 'none',
                },
                scrollbarWidth: 'none',
            }}
        >
            <Flex direction="column" height="100%" px={forceCompact ? 1 : { sm: 1, md: 2 }}>
                <VStack spacing={4} align={forceCompact ? 'center' : { sm: 'center', md: 'start' }} w="full">
                    {loading ? (
                        <Spinner size="sm" />
                    ) : (
                        <>
                            <Flex align="center" mb={4} display={fullBreakpoint}>
                                {communityTag && (
                                    <Image
                                        src={getHiveAvatarUrl(communityTag, 'medium')}
                                        alt="Profile Image"
                                        boxSize="50px"
                                        objectFit="cover"
                                        borderRadius="full"
                                        mr={2}
                                    />
                                )}
                                <Text fontSize="lg" fontWeight="bold" letterSpacing="-0.03em">{communityInfo?.title}</Text>
                            </Flex>
                            <Box display={compactBreakpoint} mb={4} w="40px" h="40px">
                                {communityTag && (
                                    <Image
                                        src={getHiveAvatarUrl(communityTag, 'small')}
                                        alt="Profile Image"
                                        boxSize="40px"
                                        borderRadius="full"
                                        objectFit="cover"
                                        minW="40px"
                                        minH="40px"
                                    />
                                )}
                            </Box>
                        </>
                    )}

                    <Tooltip label="Home" placement="right" hasArrow isDisabled={!isCompactMode}>
                        <Box w="full">
                            <Button
                                as={NextLink}
                                href="/"
                                onClick={handleHomeClick}
                                variant="ghost"
                                w="full"
                                justifyContent={iconJustify}
                                leftIcon={<Icon as={FiHome} boxSize={4} />}
                                px={3}
                                mt={4}
                                borderRadius="10px"
                                _hover={{ bg: 'rgba(28, 161, 241, 0.14)', color: 'accent' }}
                            >
                                <Text display={textDisplay}>Home</Text>
                            </Button>
                        </Box>
                    </Tooltip>
                    <Tooltip label="Explore" placement="right" hasArrow isDisabled={!isCompactMode}>
                        <Box w="full">
                            <Button
                                as={NextLink}
                                href="/explore"
                                variant="ghost"
                                w="full"
                                justifyContent={iconJustify}
                                leftIcon={<Icon as={FiCompass} boxSize={4} />}
                                px={3}
                                borderRadius="10px"
                                _hover={{ bg: 'rgba(28, 161, 241, 0.14)', color: 'accent' }}
                            >
                                <Text display={textDisplay}>Explore</Text>
                            </Button>
                        </Box>
                    </Tooltip>
                    <Tooltip label="Blogs" placement="right" hasArrow isDisabled={!isCompactMode}>
                        <Box w="full">
                            <Button
                                as={NextLink}
                                href="/blog"
                                variant="ghost"
                                w="full"
                                justifyContent={iconJustify}
                                leftIcon={<Icon as={FiBook} boxSize={4} />}
                                px={3}
                                borderRadius="10px"
                                _hover={{ bg: 'rgba(28, 161, 241, 0.14)', color: 'accent' }}
                            >
                                <Text display={textDisplay}>Blogs</Text>
                            </Button>
                        </Box>
                    </Tooltip>
                    {POINTS_FEATURE_FLAG && (
                        <Tooltip label="Leaderboard" placement="right" hasArrow isDisabled={!isCompactMode}>
                            <Box w="full">
                                <Button
                                    as={NextLink}
                                    href="/leaderboard"
                                    variant="ghost"
                                    w="full"
                                    justifyContent={iconJustify}
                                    leftIcon={<Icon as={FiAward} boxSize={4} />}
                                    px={3}
                                    borderRadius="10px"
                                    _hover={{ bg: 'rgba(28, 161, 241, 0.14)', color: 'accent' }}
                                >
                                    <Text display={textDisplay}>Leaderboard</Text>
                                </Button>
                            </Box>
                        </Tooltip>
                    )}
                    <Tooltip label="Shorts" placement="right" hasArrow isDisabled={!isCompactMode}>
                        <Box w="full">
                            <Button
                                as={NextLink}
                                href="/shorts"
                                aria-label="Shorts"
                                variant="ghost"
                                w="full"
                                justifyContent={iconJustify}
                                leftIcon={<Icon as={FiPlay} boxSize={4} />}
                                px={3}
                                borderRadius="10px"
                                _hover={{ bg: 'rgba(28, 161, 241, 0.14)', color: 'accent' }}
                            >
                                <Text display={textDisplay}>Shorts</Text>
                            </Button>
                        </Box>
                    </Tooltip>
                    <Tooltip label="OpenPods" placement="right" hasArrow isDisabled={!isCompactMode}>
                        <Box w="full" position="relative">
                            <Button
                                as={NextLink}
                                href="/hangouts"
                                variant="ghost"
                                w="full"
                                justifyContent={iconJustify}
                                leftIcon={<Icon as={FiRadio} boxSize={4} />}
                                px={3}
                                borderRadius="10px"
                                _hover={{ bg: 'rgba(28, 161, 241, 0.14)', color: 'accent' }}
                            >
                                <Text display={textDisplay}>OpenPods</Text>
                            </Button>
                            <CountBadge count={openPodsCount} />
                        </Box>
                    </Tooltip>
                    {user && (
                        <>
                            <Tooltip label="Notifications" placement="right" hasArrow isDisabled={!isCompactMode}>
                                <Box w="full" position="relative">
                                    <Button
                                        as={NextLink}
                                        href={`/@${user}/notifications`}
                                        variant="ghost"
                                        w="full"
                                        justifyContent={iconJustify}
                                        leftIcon={
                                            unreadCount > 0 ? (
                                                <motion.div
                                                    animate={{ rotate: [0, 45, 0, -45, 0] }}
                                                    transition={{ duration: 0.6, repeat: Infinity }}
                                                >
                                                    <Icon as={FiBell} boxSize={4} color="red" />
                                                </motion.div>
                                            ) : (
                                                <Icon as={FiBell} boxSize={4} />
                                            )
                                        }
                                        px={3}
                                        borderRadius="10px"
                                        _hover={{ bg: 'rgba(28, 161, 241, 0.14)', color: 'accent' }}
                                    >
                                        <Text display={textDisplay}>Notifications</Text>
                                    </Button>
                                    <CountBadge count={unreadCount} colorScheme="red" />
                                </Box>
                            </Tooltip>
                            <Tooltip label="Wallet" placement="right" hasArrow isDisabled={!isCompactMode}>
                                <Box w="full" position="relative">
                                    <Button
                                        as={NextLink}
                                        href={`/@${user}/wallet`}
                                        variant="ghost"
                                        w="full"
                                        justifyContent={iconJustify}
                                        leftIcon={<Icon as={FiCreditCard} boxSize={4} />}
                                        px={3}
                                        borderRadius="10px"
                                        _hover={{ bg: 'rgba(28, 161, 241, 0.14)', color: 'accent' }}
                                    >
                                        <Text display={textDisplay}>Wallet</Text>
                                    </Button>
                                    {hasUnclaimed && (
                                        <Box
                                            position="absolute"
                                            top="6px"
                                            right="6px"
                                            w="8px"
                                            h="8px"
                                            borderRadius="full"
                                            bg="orange.400"
                                            boxShadow="0 0 6px rgba(251, 146, 60, 0.9)"
                                            border="1px solid"
                                            borderColor="background"
                                            pointerEvents="none"
                                        />
                                    )}
                                </Box>
                            </Tooltip>
                            <Tooltip label="Chat" placement="right" hasArrow isDisabled={!isCompactMode}>
                                <Box w="full" position="relative">
                                    <Button
                                        onClick={() => setIsChatOpen?.(!isChatOpen)}
                                        variant="ghost"
                                        w="full"
                                        justifyContent={iconJustify}
                                        leftIcon={<Icon as={FiMessageSquare} boxSize={4} />}
                                        px={3}
                                        borderRadius="10px"
                                        bg={isChatOpen ? 'blue.500' : 'transparent'}
                                        color={isChatOpen ? 'white' : 'inherit'}
                                        _hover={{ bg: isChatOpen ? 'blue.600' : 'rgba(28, 161, 241, 0.14)', color: 'accent' }}
                                    >
                                        <Text display={textDisplay}>Chat</Text>
                                    </Button>
                                    <CountBadge count={!isChatOpen ? chatUnreadCount : 0} colorScheme="red" />
                                </Box>
                            </Tooltip>
                        </>
                    )}

                    {user && (
                        <Tooltip label="Settings" placement="right" hasArrow isDisabled={!isCompactMode}>
                            <Box w="full">
                                <Button
                                    as={NextLink}
                                    href="/settings"
                                    variant="ghost"
                                    w="full"
                                    justifyContent={iconJustify}
                                    leftIcon={<Icon as={FiSettings} boxSize={4} />}
                                    px={3}
                                    borderRadius="10px"
                                    _hover={{ bg: 'rgba(28, 161, 241, 0.14)', color: 'accent' }}
                                >
                                    <Text display={textDisplay}>Settings</Text>
                                </Button>
                            </Box>
                        </Tooltip>
                    )}

                    <Tooltip label="Support Snapie" placement="right" hasArrow isDisabled={!isCompactMode}>
                        <Box w="full">
                            <Button
                                as={NextLink}
                                href="/support"
                                variant="ghost"
                                w="full"
                                justifyContent={iconJustify}
                                leftIcon={<Icon as={FiHeart} boxSize={4} />}
                                px={3}
                                borderRadius="10px"
                                _hover={{ bg: 'rgba(28, 161, 241, 0.14)', color: 'accent' }}
                            >
                                <Text display={textDisplay}>Support Snapie</Text>
                            </Button>
                        </Box>
                    </Tooltip>

                    <Tooltip label="About Snapie" placement="right" hasArrow isDisabled={!isCompactMode}>
                        <Box w="full">
                            <Button
                                as="a"
                                href="https://about.snapie.io"
                                target="_blank"
                                rel="noopener noreferrer"
                                variant="ghost"
                                w="full"
                                justifyContent={iconJustify}
                                leftIcon={<Icon as={FiInfo} boxSize={4} />}
                                px={3}
                                borderRadius="10px"
                                _hover={{ bg: 'rgba(28, 161, 241, 0.14)', color: 'accent' }}
                            >
                                <Text display={textDisplay}>About</Text>
                            </Button>
                        </Box>
                    </Tooltip>

                    {/* Bottom user slot — pinned to bottom of sidebar */}
                    <Box w="full" mt="auto" pt={3}>
                        <Box w="full" h="1px" bg="rgba(28, 161, 241, 0.08)" mb={3} />
                        {isLoggedIn ? (
                            <>
                                {/* Full sidebar: avatar + username + logout icon */}
                                <Flex
                                    display={fullBreakpoint}
                                    align="center"
                                    gap={2}
                                    px={2}
                                    py={2}
                                    borderRadius="10px"
                                    _hover={{ bg: 'rgba(28, 161, 241, 0.06)' }}
                                >
                                    <Flex
                                        as={NextLink}
                                        href={`/@${user}`}
                                        align="center"
                                        gap={2}
                                        flex={1}
                                        overflow="hidden"
                                        _hover={{ textDecoration: 'none' }}
                                    >
                                        <Avatar
                                            username={user!}
                                            size="32px"
                                            flexShrink={0}
                                            sx={{ border: '1px solid rgba(28, 161, 241, 0.3)' }}
                                        />
                                        <Box overflow="hidden">
                                            <Text fontSize="10px" color="overlay.500" lineHeight={1} mb="2px">Logged in as</Text>
                                            <Text fontSize="sm" fontWeight="semibold" color="text" noOfLines={1}>@{user}</Text>
                                        </Box>
                                    </Flex>
                                    <Button
                                        variant="ghost"
                                        size="xs"
                                        onClick={logout}
                                        p={1}
                                        minW="auto"
                                        h="auto"
                                        borderRadius="md"
                                        color="overlay.400"
                                        flexShrink={0}
                                        _hover={{ color: 'red.300', bg: 'rgba(255, 80, 80, 0.1)' }}
                                        aria-label="Logout"
                                    >
                                        <Icon as={FiLogOut} boxSize={3.5} />
                                    </Button>
                                </Flex>
                                {/* Compact sidebar: avatar only */}
                                <Tooltip label={`@${user}`} placement="right" hasArrow isDisabled={!isCompactMode}>
                                    <Box display={compactBreakpoint} w="full">
                                        <Button
                                            as={NextLink}
                                            href={`/@${user}`}
                                            variant="ghost"
                                            w="full"
                                            justifyContent="center"
                                            px={3}
                                            borderRadius="10px"
                                            _hover={{ bg: 'rgba(28, 161, 241, 0.14)' }}
                                        >
                                            <Avatar
                                                username={user!}
                                                size="24px"
                                                sx={{ border: '1px solid rgba(28, 161, 241, 0.3)' }}
                                            />
                                        </Button>
                                    </Box>
                                </Tooltip>
                            </>
                        ) : (
                            <>
                                <Tooltip label="Login" placement="right" hasArrow isDisabled={!isCompactMode}>
                                    <Box w="full" mb={2}>
                                        <Button
                                            onClick={openLoginModal}
                                            variant="solid"
                                            colorScheme="teal"
                                            w="full"
                                            justifyContent={iconJustify}
                                            leftIcon={<Icon as={FiLogIn} boxSize={4} />}
                                            px={3}
                                            borderRadius="10px"
                                        >
                                            <Text display={textDisplay}>Login</Text>
                                        </Button>
                                    </Box>
                                </Tooltip>
                                <Tooltip label="Create account" placement="right" hasArrow isDisabled={!isCompactMode}>
                                    <Box w="full">
                                        <Button
                                            as={NextLink}
                                            href="/join"
                                            variant="ghost"
                                            w="full"
                                            justifyContent={iconJustify}
                                            leftIcon={<Icon as={FiUserPlus} boxSize={4} />}
                                            px={3}
                                            borderRadius="10px"
                                            _hover={{ bg: 'rgba(28, 161, 241, 0.14)', color: 'accent' }}
                                        >
                                            <Text display={textDisplay}>Create account</Text>
                                        </Button>
                                    </Box>
                                </Tooltip>
                            </>
                        )}
                    </Box>
                </VStack>
            </Flex>
        </Box>
    );
}
